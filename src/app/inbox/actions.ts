"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  approveImportRecord as approveImportRecordLib,
  createImportRecord,
  deleteImportRecord as deleteImportRecordLib,
  rejectImportRecord as rejectImportRecordLib,
} from "@/lib/import-records/import-records";
import { createTicket, type CreateTicketInput } from "@/lib/tickets/tickets";
import { createBetLeg } from "@/lib/tickets/bet-legs";
import { linkBetLegEvent } from "@/lib/tickets/bet-leg-events";
import { setBetLegSubject } from "@/lib/tickets/bet-leg-subjects";
import { getUserPreferences } from "@/lib/preferences/get-user-preferences";
import { extractScreenshotText } from "@/lib/import/extract-screenshot";
import { SlipParseError } from "@/lib/import/parse-slip-text";
import { DfsLineupParseError } from "@/lib/import/parse-dfs-lineup";
import { FantasyMatchupParseError } from "@/lib/import/parse-fantasy-matchup";
import { detectImportKind, UnknownImportKindError } from "@/lib/import/detect-kind";
import {
  buildImportReview,
  buildDfsLineupReview,
  buildFantasyMatchupReview,
  DEFAULT_SPORTSBOOK,
  type ApprovedTicketGroup,
  type ApprovedDfsLineupGroup,
  type ApprovedFantasyMatchupGroup,
} from "@/lib/import/pipeline";
import { fetchDuplicateCandidates, fetchMatchCandidates, fetchPlayerSlotCandidates } from "@/lib/import/candidates";
import { createDfsLineup } from "@/lib/dfs/lineups";
import { createDfsLineupSlot } from "@/lib/dfs/lineup-slots";
import { createDfsEntry } from "@/lib/dfs/entries";
import { findOrCreateFantasyLeague } from "@/lib/fantasy/leagues";
import { createFantasyMatchup } from "@/lib/fantasy/matchups";
import { createFantasyRosterSlot } from "@/lib/fantasy/roster-slots";

const BUCKET = "screenshots";

async function requireUserId(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

/**
 * Runs the Import Pipeline (docs/PRD.md section 30) against already-extracted
 * text and saves the result onto the ImportRecord: `needs_review` with the
 * proposed review payload on success, or `failed` with the error on any
 * structural parse problem — the parser never silently saves a guess.
 *
 * `detectImportKind` (docs/PRD.md section 43) first tells a sportsbook
 * ticket, a DFS lineup, and a fantasy matchup apart by header line, then
 * dispatches to the matching parser/matcher pair. The saved `parsed_payload`
 * is a discriminated `{ kind, review }` so the review screen and the
 * approval Server Actions below know which shape they're looking at.
 */
async function runImportPipeline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  importRecordId: string,
  text: string,
): Promise<void> {
  try {
    const kind = detectImportKind(text);
    let parsedPayload: unknown;

    if (kind === "bet_slip") {
      const [candidates, existingTickets, preferences] = await Promise.all([
        fetchMatchCandidates(supabase, userId),
        fetchDuplicateCandidates(supabase, userId),
        getUserPreferences(supabase, userId),
      ]);
      const review = buildImportReview(text, candidates, existingTickets, preferences.timezone);
      parsedPayload = { kind, review };
    } else if (kind === "dfs_lineup") {
      const candidates = await fetchPlayerSlotCandidates(supabase, userId);
      const review = buildDfsLineupReview(text, candidates);
      parsedPayload = { kind, review };
    } else {
      const candidates = await fetchPlayerSlotCandidates(supabase, userId);
      const review = buildFantasyMatchupReview(text, candidates);
      parsedPayload = { kind, review };
    }

    const { error } = await supabase
      .from("import_records")
      .update({ status: "needs_review", extracted_text: text, parsed_payload: parsedPayload, parse_error: null })
      .eq("id", importRecordId);
    if (error) throw error;
  } catch (err: unknown) {
    const message =
      err instanceof SlipParseError ||
      err instanceof DfsLineupParseError ||
      err instanceof FantasyMatchupParseError ||
      err instanceof UnknownImportKindError
        ? err.message
        : `Import failed: ${(err as Error).message}`;
    const { error } = await supabase
      .from("import_records")
      .update({ status: "failed", extracted_text: text, parse_error: message })
      .eq("id", importRecordId);
    if (error) throw error;
  }
}

const MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * Uploads one or more screenshots to private Storage, creates an
 * ImportRecord for each, and immediately runs extraction + parsing since the
 * user initiated the upload (docs/PRD.md section 29.1: "From Phase 3 on:
 * upload triggers parsing right away"). Accepts a batch upload so a user can
 * queue several slips from their phone in one go.
 */
export async function uploadScreenshot(formData: FormData): Promise<void> {
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw new Error("No file provided");
  }

  const supabase = await createClient();
  const userId = await requireUserId(supabase);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  for (const file of files) {
    const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const storagePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type || undefined,
    });
    if (uploadError) throw uploadError;

    const record = await createImportRecord(supabase, userId, {
      source: "screenshot",
      originalFilename: file.name,
      storagePath,
    });

    if (!apiKey) {
      await supabase
        .from("import_records")
        .update({ status: "failed", parse_error: "ANTHROPIC_API_KEY is not configured." })
        .eq("id", record.id);
      continue;
    }

    const mediaType = MEDIA_TYPES.has(file.type) ? (file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif") : "image/jpeg";

    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const text = await extractScreenshotText({ apiKey, imageBase64: bytes.toString("base64"), mediaType });
      await runImportPipeline(supabase, userId, record.id, text);
    } catch (err: unknown) {
      await supabase
        .from("import_records")
        .update({ status: "failed", parse_error: `Screenshot extraction failed: ${(err as Error).message}` })
        .eq("id", record.id);
    }
  }

  revalidatePath("/inbox");
  redirect("/inbox");
}

/** Creates an ImportRecord from pasted slip text and runs it through the pipeline right away (docs/PRD.md section 29). */
export async function pasteSlipText(formData: FormData): Promise<void> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) throw new Error("No text provided");

  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  const record = await createImportRecord(supabase, userId, { source: "text" });
  await runImportPipeline(supabase, userId, record.id, text);

  revalidatePath("/inbox");
  redirect("/inbox");
}

export async function getImportRecordImageUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  await requireUserId(supabase);

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Approves an ImportRecord: creates the transcribed Ticket linked to it,
 * deletes the stored image, and marks it approved (docs/PRD.md section 29.1,
 * 31). The image is never retained after approval.
 */
export async function approveImportRecord(
  importRecordId: string,
  storagePath: string | null,
  ticketInput: CreateTicketInput,
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  await createTicket(supabase, userId, { ...ticketInput, importRecordId });

  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  await approveImportRecordLib(supabase, importRecordId);

  revalidatePath("/inbox");
  revalidatePath("/tickets");
  redirect("/inbox");
}

/**
 * Approves a reviewed, parsed ImportRecord: creates one Ticket per surviving
 * group (after any split/merge edits the user made on the review screen),
 * with its BetLegs and their proposed Event/Subject links, then deletes the
 * stored image and marks the ImportRecord approved (docs/PRD.md sections
 * 29.1, 30, 31). A group with no legs is skipped — the user removed it
 * during review. Nothing is written until this call (docs/PRD.md section
 * 30: "The parser must never silently save imported data").
 */
export async function approveParsedImport(
  importRecordId: string,
  storagePath: string | null,
  groups: ApprovedTicketGroup[],
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  for (const group of groups) {
    if (group.legs.length === 0) continue;

    const ticket = await createTicket(supabase, userId, {
      sportsbook: DEFAULT_SPORTSBOOK,
      sportsbookTicketId: group.sportsbookTicketId,
      stakeCents: group.stakeCents,
      toWinCents: group.toWinCents,
      totalReturnCents: group.totalReturnCents,
      isBonusBet: group.isBonusBet,
      placedAt: group.placedAt,
      promotionNote: group.promotionNote,
      importRecordId,
    });

    for (const leg of group.legs) {
      const betLeg = await createBetLeg(supabase, userId, {
        ticketId: ticket.id,
        sport: leg.sport,
        league: leg.league,
        rawDescription: leg.rawDescription,
        marketType: leg.marketType,
        selection: leg.selection,
        line: leg.line,
        oddsAmerican: leg.oddsAmerican,
      });

      if (leg.eventId) {
        await linkBetLegEvent(supabase, userId, betLeg.id, leg.eventId, "auto");
      }
      for (const subject of leg.subjects) {
        await setBetLegSubject(supabase, userId, {
          betLegId: betLeg.id,
          teamId: subject.teamId,
          participantId: subject.participantId,
          proposedDirection: subject.direction,
          matchMethod: "auto",
        });
      }
    }
  }

  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  await approveImportRecordLib(supabase, importRecordId);

  revalidatePath("/inbox");
  revalidatePath("/tickets");
  redirect("/inbox");
}

/**
 * Approves a reviewed, parsed DFS lineup ImportRecord: creates one DFSLineup
 * per surviving group (after any edits made on the review screen), its
 * DFSLineupSlots with their proposed Participant/Event links, and one
 * DFSEntry for the lineup, then deletes the stored image and marks the
 * ImportRecord approved (docs/PRD.md sections 29.1, 30, 40-43). A group with
 * no slots is skipped — the user removed it during review.
 */
export async function approveParsedDfsLineup(
  importRecordId: string,
  storagePath: string | null,
  groups: ApprovedDfsLineupGroup[],
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  for (const group of groups) {
    if (group.slots.length === 0) continue;

    const lineup = await createDfsLineup(supabase, userId, {
      platform: group.platform,
      sport: group.sport,
      slateName: group.slateName,
      importRecordId,
    });

    for (const slot of group.slots) {
      await createDfsLineupSlot(supabase, userId, {
        dfsLineupId: lineup.id,
        slot: slot.slot,
        playerName: slot.playerName,
        participantId: slot.participantId,
        participantMatchMethod: slot.participantId ? "auto" : undefined,
        salary: slot.salary,
        automaticActualPoints: slot.automaticActualPoints,
        eventId: slot.eventId,
        eventMatchMethod: slot.eventId ? "auto" : undefined,
      });
    }

    await createDfsEntry(supabase, userId, {
      dfsLineupId: lineup.id,
      contestName: group.contestName,
      entryFeeCents: group.entryFeeCents,
      potentialPrizeCents: group.potentialPrizeCents,
      automaticCurrentPoints: group.automaticCurrentPoints,
    });
  }

  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  await approveImportRecordLib(supabase, importRecordId);

  revalidatePath("/inbox");
  revalidatePath("/dfs");
  redirect("/inbox");
}

/**
 * Approves a reviewed, parsed Fantasy Matchup ImportRecord: finds or creates
 * the named FantasyLeague, creates one FantasyMatchup per surviving group
 * (after any edits made on the review screen) and its FantasyRosterSlots
 * with their proposed Participant/Event links, then deletes the stored
 * image and marks the ImportRecord approved (docs/PRD.md sections 29.1, 30,
 * 34-38, 43). A group with no starters on either side is skipped — the user
 * removed it during review.
 */
export async function approveParsedFantasyMatchup(
  importRecordId: string,
  storagePath: string | null,
  groups: ApprovedFantasyMatchupGroup[],
): Promise<void> {
  const supabase = await createClient();
  const userId = await requireUserId(supabase);

  for (const group of groups) {
    if (group.starters.length === 0 && group.opponentStarters.length === 0) continue;

    const league = await findOrCreateFantasyLeague(supabase, userId, {
      name: group.leagueName,
      platform: group.platform,
      sport: group.sport,
      season: group.season,
      userTeamName: group.userTeamName,
    });

    const matchup = await createFantasyMatchup(supabase, userId, {
      fantasyLeagueId: league.id,
      week: group.week,
      userTeamName: group.userTeamName,
      opponentTeamName: group.opponentTeamName,
      automaticUserScore: group.automaticUserScore,
      automaticOpponentScore: group.automaticOpponentScore,
      userProjectedScore: group.userProjectedScore,
      opponentProjectedScore: group.opponentProjectedScore,
      importRecordId,
    });

    for (const starter of group.starters) {
      await createFantasyRosterSlot(supabase, userId, {
        fantasyMatchupId: matchup.id,
        side: "user",
        slot: "Starter",
        playerName: starter.playerName,
        participantId: starter.participantId,
        participantMatchMethod: starter.participantId ? "auto" : undefined,
        eventId: starter.eventId,
        eventMatchMethod: starter.eventId ? "auto" : undefined,
      });
    }
    for (const starter of group.opponentStarters) {
      await createFantasyRosterSlot(supabase, userId, {
        fantasyMatchupId: matchup.id,
        side: "opponent",
        slot: "Starter",
        playerName: starter.playerName,
        participantId: starter.participantId,
        participantMatchMethod: starter.participantId ? "auto" : undefined,
        eventId: starter.eventId,
        eventMatchMethod: starter.eventId ? "auto" : undefined,
      });
    }
  }

  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  await approveImportRecordLib(supabase, importRecordId);

  revalidatePath("/inbox");
  revalidatePath("/fantasy");
  redirect("/inbox");
}

/** Rejects an ImportRecord, deleting its stored image immediately (docs/PRD.md section 29.1). */
export async function rejectImportRecord(importRecordId: string, storagePath: string | null): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);

  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  await rejectImportRecordLib(supabase, importRecordId);

  revalidatePath("/inbox");
  redirect("/inbox");
}

/** Hard-deletes an ImportRecord; created records remain with importRecordId set to null (docs/PRD.md section 63.1). */
export async function deleteImportRecord(importRecordId: string, storagePath: string | null): Promise<void> {
  const supabase = await createClient();
  await requireUserId(supabase);

  if (storagePath) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  await deleteImportRecordLib(supabase, importRecordId);

  revalidatePath("/inbox");
  redirect("/inbox");
}
