// Next ships picomatch prebuilt without type declarations; src/next-config.test.ts uses it to match
// route keys the way the build does.
declare module "next/dist/compiled/picomatch" {
  const picomatch: (glob: string, options?: { dot?: boolean; contains?: boolean }) => (input: string) => boolean;
  export default picomatch;
}
