declare module 'https://cdn.jsdelivr.net/npm/bpac-js@latest/dist/index.js' {
  interface BpacOptions {
    templatePath: string;
    exportDir?: string;
    printer?: string;
  }

  interface PrintOptions {
    copies?: number;
    printName?: string;
    fitPage?: boolean;
    ignoreMissingKeys?: boolean;
    highResolution?: boolean;
    autoCut?: boolean;
    cutAtEnd?: boolean;
    noCut?: boolean;
  }

  class BpacDocument {
    constructor(options: BpacOptions);
    print(data: Record<string, string | Date> | Record<string, string | Date>[], options?: PrintOptions): Promise<boolean>;
    getImageData(data: Record<string, string | Date>, options?: { width?: number; height?: number }): Promise<string>;
    getPrinterName(): Promise<string>;
    export(data: Record<string, string | Date>, filePathOrFileName: string, options?: { resolution?: number }): Promise<boolean>;
    static getPrinterList(): Promise<string[]>;
  }

  export default BpacDocument;
}
