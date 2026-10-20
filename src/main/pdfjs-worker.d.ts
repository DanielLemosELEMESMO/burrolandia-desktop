// O worker do pdf.js não traz tipos; só precisamos dele carregado (ver conversor.ts).
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
