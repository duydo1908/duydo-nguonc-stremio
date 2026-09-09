declare module "stremio-addon-sdk" {
  interface Args { type: string; id: string; extra?: Record<string, string>; }
  interface AddonInterface { manifest: unknown; get(resource: string, type: string, id: string, extra?: Record<string, string>): Promise<any>; }
  class addonBuilder {
    constructor(manifest: object);
    defineCatalogHandler(handler: (args: Args) => Promise<object>): void;
    defineMetaHandler(handler: (args: Args) => Promise<object>): void;
    defineStreamHandler(handler: (args: Args) => Promise<object>): void;
    getInterface(): AddonInterface;
  }
  const sdk: { addonBuilder: typeof addonBuilder; serveHTTP(addon: AddonInterface, options: { port: number }): Promise<{ url: string; server: import("node:http").Server }> };
  export default sdk;
}
