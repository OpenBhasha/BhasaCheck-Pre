import { ITranscriptSegment } from '../models/Dataset';

/**
 * Formats seconds as an SRT timestamp: HH:MM:SS,mmm
 */
function formatSrtTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);

  const pad = (n: number, width = 2) => n.toString().padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * Builds the metadata line shown above each cue's text — everything the
 * system knows about that segment besides the text itself (speaker,
 * overlapping speakers, language, model, confidence), omitting fields that
 * weren't available rather than printing "null". Standard SRT readers just
 * render this as an extra subtitle line; it's also there for any downstream
 * tooling parsing the file back out.
 */
function buildMetadataLine(segment: ITranscriptSegment): string {
  const parts: string[] = [];
  if (segment.speaker) parts.push(`Speaker: ${segment.speaker}`);
  if (segment.overlappingSpeakers.length > 0) {
    parts.push(`Overlapping: ${segment.overlappingSpeakers.join(', ')}`);
  }
  if (segment.language) parts.push(`Language: ${segment.language}`);
  if (segment.transcriptionModel) parts.push(`Model: ${segment.transcriptionModel}`);
  if (segment.confidence !== null && segment.confidence !== undefined) {
    parts.push(`Confidence: ${segment.confidence.toFixed(2)}`);
  }
  return parts.join(' | ');
}

/**
 * Generates a standard, valid .srt file from a Dataset's transcript
 * segments. Only speech segments with actual text become cues — silence/
 * non-speech gaps carry no text and aren't meaningful subtitle entries.
 *
 * Each cue's text block is two lines: a metadata line (speaker, overlap,
 * language, model, confidence — whichever are available) followed by the
 * transcribed text, so every piece of diarization/transcription data the
 * pipeline produced survives into the export without breaking standard SRT
 * parsing (extra text lines per cue are valid SRT).
 */
export function generateSrt(segments: ITranscriptSegment[]): string {
  const cues = segments.filter((s) => s.isSpeech && s.text && s.text.trim().length > 0);

  const blocks = cues.map((segment, index) => {
    const metadataLine = buildMetadataLine(segment);
    const lines = [
      String(index + 1),
      `${formatSrtTimestamp(segment.startTime)} --> ${formatSrtTimestamp(segment.endTime)}`,
      ...(metadataLine ? [metadataLine] : []),
      segment.text.trim(),
    ];
    return lines.join('\n');
  });

  // SRT cues are separated by a blank line, and files conventionally end
  // with a trailing newline.
  return blocks.join('\n\n') + '\n';
}
