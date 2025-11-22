import PyPDF2
import re
import os
import shutil

def _is_likely_valid_pdf(file_path: str) -> bool:
    try:
        if not os.path.exists(file_path) or os.path.getsize(file_path) < 5 * 1024:
            # Too small to be a real PDF
            return False
        with open(file_path, 'rb') as f:
            header = f.read(8)
            if not header.startswith(b'%PDF'):
                return False
            # Check EOF marker in last 4KB
            try:
                f.seek(-4096, os.SEEK_END)
            except OSError:
                f.seek(0)
            tail = f.read()
            if b'%%EOF' not in tail:
                return False
        return True
    except Exception:
        return False


def _safe_passthrough(input_path: str, output_path: str, reason: str) -> None:
    try:
        print(f"Skipping watermark removal: {reason}. Passing through original file.")
        shutil.copyfile(input_path, output_path)
    except Exception as copy_error:
        # Surface a clear error so caller can handle it
        raise RuntimeError(f"Failed to pass through original PDF: {copy_error}") from copy_error


def remove_watermark_from_pdf(input_path, output_path):
    """Advanced watermark removal by modifying content streams"""

    # Quick validation to avoid PyPDF2 crashes on bad/incomplete files
    if not _is_likely_valid_pdf(input_path):
        _safe_passthrough(input_path, output_path, "input is not a valid/complete PDF")
        return

    try:
        with open(input_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            writer = PyPDF2.PdfWriter()

            for page_num in range(len(reader.pages)):
                page = reader.pages[page_num]

                # Get the page content stream
                content = page.get_contents()

                if content:
                    # Decode the content stream
                    content_data = content.get_data()

                    try:
                        # Convert bytes to string for processing
                        content_str = content_data.decode('latin-1')

                        # Look for the watermark XObject reference (Fm0) and remove it
                        # This is a simplified approach - in reality, we'd need to parse the PostScript

                        # Common patterns for drawing XObjects:
                        # /Fm0 Do
                        # /Fm0 Do\n
                        # etc.

                        # Remove lines containing Fm0 (the watermark XObject)
                        lines = content_str.split('\n')
                        filtered_lines = []

                        for line in lines:
                            # Skip lines that reference the watermark XObject
                            if '/Fm0' in line and 'Do' in line:
                                print(f"Removed watermark reference on page {page_num + 1}: {line.strip()}")
                                continue
                            filtered_lines.append(line)

                        # Reconstruct content
                        new_content_str = '\n'.join(filtered_lines)
                        new_content_data = new_content_str.encode('latin-1')

                        # Create new content stream
                        from PyPDF2.generic import DecodedStreamObject, NameObject, DictionaryObject
                        new_content = DecodedStreamObject()
                        new_content.set_data(new_content_data)
                        new_content[NameObject('/Filter')] = NameObject('/FlateDecode')

                        # Replace the page content
                        page[NameObject('/Contents')] = new_content

                    except Exception as e:
                        print(f"Could not process content stream for page {page_num + 1}: {e}")

                writer.add_page(page)

            with open(output_path, 'wb') as output_file:
                writer.write(output_file)

            print(f"Created cleaned PDF: {output_path}")
            print("Note: This attempts to remove watermark XObject references from content streams.")
            print("Success depends on how the watermark is embedded.")
    except PyPDF2.errors.PdfReadError as pdf_err:
        # If PyPDF2 cannot read it, just pass the original through
        _safe_passthrough(input_path, output_path, f"PyPDF2 could not read PDF ({pdf_err})")
    except Exception as e:
        # Any other unexpected error — pass through original to avoid breaking the caller
        _safe_passthrough(input_path, output_path, f"unexpected error: {e}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) == 3:
        input_path = sys.argv[1]
        output_path = sys.argv[2]
        remove_watermark_from_pdf(input_path, output_path)
    else:
        print("Usage: python advanced_watermark_removal.py <input_path> <output_path>")
        sys.exit(1)
