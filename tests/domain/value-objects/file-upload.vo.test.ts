import { describe, it, expect } from "vitest";
import { FileUpload } from "../../../src/domain/value-objects/file-upload.vo";

describe("FileUpload VO", () => {
  it("creates a valid FileUpload for PDF", () => {
    const data = Buffer.from("hello");
    const result = FileUpload.create("contract.pdf", "application/pdf", data.length, data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.originalName).toBe("contract.pdf");
      expect(result.value.sanitizedName).toBe("contract.pdf");
      expect(result.value.mimeType).toBe("application/pdf");
      expect(result.value.size).toBe(data.length);
      expect(result.value.fileExtension).toBe(".pdf");
      expect(result.value.isDocument).toBe(true);
      expect(result.value.isImage).toBe(false);
    }
  });

  it("sanitizes dangerous filenames", () => {
    const data = Buffer.from("x");
    const result = FileUpload.create('  ev<i>l :name .png  ', "image/png", 1, data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.originalName).not.toMatch(/[<>:"/\\|?*]/);
      // Test for control characters without tripping ESLint
      const hasControl = [...result.value.originalName].some((ch) => {
        const code = ch.charCodeAt(0);
        return (code >= 0x00 && code <= 0x1F) || code === 0x7F;
      });
      expect(hasControl).toBe(false);
      expect(result.value.sanitizedName).toBe("ev_i_l_name_.png");
      expect(result.value.fileExtension).toBe(".png");
      expect(result.value.isImage).toBe(true);
    }
  });

  it("rejects disallowed MIME types", () => {
    const data = Buffer.alloc(10);
    const result = FileUpload.create("script.sh", "text/x-shellscript", data.length, data);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("MIME type 'text/x-shellscript' is not allowed");
    }
  });

  it("enforces size positivity and cap (50MB)", () => {
    const okBuf = Buffer.alloc(5);
    const okResult = FileUpload.create("a.txt", "text/plain", okBuf.length, okBuf);
    expect(okResult.ok).toBe(true);

    const big = Buffer.alloc(50 * 1024 * 1024 + 1);
    const bigResult = FileUpload.create("big.pdf", "application/pdf", big.length, big);
    expect(bigResult.ok).toBe(false);
    if (!bigResult.ok) {
      expect(bigResult.error.message).toMatch(/cannot exceed 50MB/);
    }

    const negResult = FileUpload.create("neg.txt", "text/plain", -1, Buffer.alloc(0));
    expect(negResult.ok).toBe(false);
    if (!negResult.ok) {
      expect(negResult.error.message).toMatch(/size mismatch/);
    }
  });

  it("validates size equals actual buffer length", () => {
    const buf = Buffer.alloc(4);
    const result = FileUpload.create("mismatch.txt", "text/plain", 3, buf);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/size mismatch/);
    }
  });

  it("requires non-empty data and filename", () => {
    const emptyNameResult = FileUpload.create("", "text/plain", 1, Buffer.alloc(1));
    expect(emptyNameResult.ok).toBe(false);
    if (!emptyNameResult.ok) {
      expect(emptyNameResult.error.message).toMatch(/File name cannot be empty/);
    }

    const zeroSizeResult = FileUpload.create("x.txt", "text/plain", 0, Buffer.alloc(0));
    expect(zeroSizeResult.ok).toBe(false);
    if (!zeroSizeResult.ok) {
      expect(zeroSizeResult.error.message).toMatch(/File size must be positive/);
    }
  });
});
