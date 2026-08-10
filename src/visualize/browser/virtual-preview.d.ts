declare module 'virtual:preview' {
  const preview: (context: unknown) => unknown | Promise<unknown>;
  export default preview;
}
