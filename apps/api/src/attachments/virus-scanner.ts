export const VIRUS_SCANNER = "VIRUS_SCANNER";

export interface VirusScanner {
  scan(buffer: Buffer, fileName: string): Promise<void>;
}

export class NoopVirusScanner implements VirusScanner {
  async scan(buffer: Buffer, fileName: string): Promise<void> {
    void buffer;
    void fileName;
  }
}
