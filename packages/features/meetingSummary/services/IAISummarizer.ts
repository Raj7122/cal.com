export interface IAISummarizer {
  summarize(
    transcript: string,
    context?: { title?: string; attendees?: string[] }
  ): Promise<string>;
}
