import OpenAI from "openai";
import { createWriteStream, createReadStream } from "fs";
import { unlink } from "fs/promises";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import type { Uploadable } from "openai/uploads";

/**
 * Downloads a video file from a URL to a temporary location
 * @param videoUrl - URL of the video to download
 * @param outputPath - Path to save the downloaded file
 * @returns Path to the downloaded file
 */
export async function downloadVideo(
  videoUrl: string,
  outputPath: string
): Promise<string> {
  try {
    const response = await fetch(videoUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to download video: ${response.status} ${response.statusText}`
      );
    }

    if (!response.body) {
      throw new Error("No response body available for download");
    }

    // Convert Web ReadableStream to Node.js Readable stream
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStream = Readable.fromWeb(response.body as any);
    const fileStream = createWriteStream(outputPath);

    await pipeline(nodeStream, fileStream);

    return outputPath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Video download failed: ${errorMessage}`);
  }
}

/**
 * Transcribes an audio/video file using OpenAI Whisper API
 * @param filePath - Path to the audio/video file
 * @param openaiToken - OpenAI API token
 * @returns Transcription text
 */
export async function transcribeWithWhisper(
  filePath: string,
  openaiToken: string
): Promise<string> {
  try {
    const openai = new OpenAI({ apiKey: openaiToken });

    // Create a read stream for the file
    const fileStream = createReadStream(filePath);

    const transcription = await openai.audio.transcriptions.create({
      file: fileStream as Uploadable,
      model: "whisper-1",
    });

    return transcription.text;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Whisper transcription failed: ${errorMessage}`);
  }
}

/**
 * Downloads a video and transcribes it using OpenAI Whisper
 * @param videoUrl - URL of the Instagram video
 * @param openaiToken - OpenAI API token
 * @returns Transcription text
 */
export async function downloadAndTranscribe(
  videoUrl: string,
  openaiToken: string
): Promise<string> {
  const tempFilePath = `/tmp/instagram-video-${Date.now()}.mp4`;

  try {
    // Download the video
    await downloadVideo(videoUrl, tempFilePath);

    // Transcribe with Whisper
    const transcription = await transcribeWithWhisper(
      tempFilePath,
      openaiToken
    );

    // Clean up temporary file
    await unlink(tempFilePath);

    return transcription;
  } catch (error) {
    // Attempt to clean up temp file even on error
    try {
      await unlink(tempFilePath);
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  }
}
