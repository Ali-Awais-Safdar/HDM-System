import { describe, it, expect } from "vitest";
import { FileUpload } from "../../../src/domain/value-objects/file-upload.vo";

describe("FileUpload VO", () => {
  it("creates a valid FileUpload for PDF", () => {
    const data = Buffer.from("hello");
    const vo = FileUpload.create("contract.pdf", "application/pdf", data.length, data);
    expect(vo.originalName).toBe("contract.pdf");
    expect(vo.sanitizedName).toBe("contract.pdf");
    expect(vo.mimeType).toBe("application/pdf");
    expect(vo.size).toBe(data.length);
    expect(vo.fileExtension).toBe(".pdf");
    expect(vo.isDocument).toBe(true);
    expect(vo.isImage).toBe(false);
  });

  it("sanitizes dangerous filenames", () => {
    const data = Buffer.from("x");
    const vo = FileUpload.create('  ev<i>l :name .png  ', "image/png", 1, data);
    expect(vo.originalName).not.toMatch(/[<>:"/\\|?*\x00-\x1f]/);
    // Spaces collapsed to underscores, dangerous chars removed
    expect(vo.sanitizedName).toBe("ev_i_l_name_.png");
    expect(vo.fileExtension).toBe(".png");
    expect(vo.isImage).toBe(true);
  });

  it("rejects disallowed MIME types", () => {
    const data = Buffer.alloc(10);
    expect(() =>
      FileUpload.create("script.sh", "text/x-shellscript", data.length, data)
    ).toThrow(/MIME type 'text\/x-shellscript' is not allowed/);
  });

  it("enforces size positivity and cap (50MB)", () => {
    const okBuf = Buffer.alloc(5);
    expect(() => FileUpload.create("a.txt", "text/plain", okBuf.length, okBuf)).not.toThrow();

    const big = Buffer.alloc(50 * 1024 * 1024 + 1);
     expect(() =>
     FileUpload.create("big.pdf", "application/pdf", big.length, big)
    ).toThrow(/cannot exceed 50MB/);

    expect(() =>
      FileUpload.create("neg.txt", "text/plain", -1, Buffer.alloc(0))
    ).toThrow(/must be positive/);
  });

  it("validates size equals actual buffer length", () => {
    const buf = Buffer.alloc(4);
    expect(() =>
      FileUpload.create("mismatch.txt", "text/plain", 3, buf)
    ).toThrow(/size mismatch/);
  });

  it("requires non-empty data and filename", () => {
    expect(() =>
      // filename empty
      FileUpload.create("", "text/plain", 1, Buffer.alloc(1))
    ).toThrow(/File name cannot be empty/);

    expect(() =>
         FileUpload.create("x.txt", "text/plain", 0, Buffer.alloc(0))
       ).toThrow(/File size must be positive/);
  });
});
