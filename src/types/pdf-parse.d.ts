declare module 'pdf-parse/lib/pdf-parse.js' {
  function pdfParse(dataBuffer: Buffer): Promise<{ text: string; numpages: number }>
  export default pdfParse
}
