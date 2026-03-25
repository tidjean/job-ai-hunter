import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { CvDocument } from "../types/app";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export function PdfViewer({ cv }: { cv: CvDocument }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(720);
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null);
  const [hasError, setHasError] = useState(false);
  const fileUrl = `/api/admin/cv/${cv.id}/file`;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setWidth(Math.max(320, Math.floor(element.clientWidth)));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      try {
        setHasError(false);
        setFileData(null);
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Unable to load PDF (${response.status})`);
        }

        const buffer = await response.arrayBuffer();
        if (!cancelled) {
          setFileData(buffer);
        }
      } catch (error) {
        console.error("Failed to load PDF preview", error);
        if (!cancelled) {
          setHasError(true);
        }
      }
    };

    void loadPdf();

    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  return (
    <div className="pdf-viewer-shell">
      <div className="pdf-toolbar">
        <div>
          <strong>{cv.filename}</strong>
          <span>Uploaded {new Date(cv.uploadedAt).toLocaleString()}</span>
        </div>
        <a href={fileUrl} target="_blank" rel="noreferrer">
          Open PDF
        </a>
      </div>

      <div ref={containerRef} className="pdf-viewer-frame">
        {hasError ? (
          <div className="empty-state">Unable to display this PDF.</div>
        ) : (
          <Document
            file={fileData}
            loading={<div className="empty-state">Loading PDF...</div>}
            error={<div className="empty-state">Unable to display this PDF.</div>}
            noData={<div className="empty-state">Loading PDF...</div>}
            onLoadError={(error) => {
              console.error("PDF.js render error", error);
              setHasError(true);
            }}
            onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
          >
            {Array.from({ length: numPages }, (_, index) => (
              <Page
                key={index + 1}
                pageNumber={index + 1}
                width={width}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
            ))}
          </Document>
        )}
      </div>
    </div>
  );
}
