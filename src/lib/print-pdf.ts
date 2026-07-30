// Gera um PDF a partir do mesmo DOM usado na impressão (.sheet),
// garantindo layout idêntico entre imprimir / baixar / compartilhar.

const A4_W = 210;
const A4_H = 297;

export async function generateSheetPdfBlob(el: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  // Neutraliza qualquer escala responsiva aplicada na visualização mobile
  const scaler = el.parentElement as HTMLElement | null;
  const prevTransform = scaler?.style.transform ?? "";
  const prevHeight = scaler?.parentElement?.style.height ?? "";
  if (scaler) scaler.style.transform = "none";
  if (scaler?.parentElement) scaler.parentElement.style.height = "auto";

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(el, {
      scale: Math.min(3, Math.max(2, window.devicePixelRatio || 2)),
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: el.scrollWidth,
    });
  } finally {
    if (scaler) scaler.style.transform = prevTransform;
    if (scaler?.parentElement) scaler.parentElement.style.height = prevHeight;
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const imgH = (canvas.height * A4_W) / canvas.width;

  if (imgH <= A4_H + 0.5) {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, A4_W, imgH);
  } else {
    // Fatia o canvas em páginas A4
    const pageHeightPx = Math.floor((canvas.width * A4_H) / A4_W);
    let y = 0;
    let first = true;
    while (y < canvas.height) {
      const sliceH = Math.min(pageHeightPx, canvas.height - y);
      const page = document.createElement("canvas");
      page.width = canvas.width;
      page.height = sliceH;
      const ctx = page.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, page.width, page.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!first) pdf.addPage();
      pdf.addImage(
        page.toDataURL("image/jpeg", 0.95),
        "JPEG",
        0,
        0,
        A4_W,
        (sliceH * A4_W) / canvas.width,
      );
      first = false;
      y += sliceH;
    }
  }

  return pdf.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share !== "function") return false;
  try {
    const probe = new File([new Blob(["x"], { type: "application/pdf" })], "p.pdf", {
      type: "application/pdf",
    });
    return typeof nav.canShare === "function" ? nav.canShare({ files: [probe] }) : true;
  } catch {
    return false;
  }
}

export async function sharePdf(blob: Blob, filename: string, title: string): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share !== "function") return false;
  try {
    const file = new File([blob], filename, { type: "application/pdf" });
    if (typeof nav.canShare === "function" && !nav.canShare({ files: [file] })) return false;
    await nav.share({ files: [file], title });
    return true;
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return true;
    return false;
  }
}
