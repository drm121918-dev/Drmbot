# Apna College Course Content Fetcher

Node.js script that authenticates via cookies/CSRF tokens and fetches course content from Apna College's API. Uses HTTPS requests with gzip/deflate/brotli decompression. Extracts course metadata from `/api/notifications` POST endpoint, then retrieves full course structure via `/api/course/{slug}?contents&path-player` GET request.

PDF extraction uses multiline regex pattern matching against the JSON response to identify MongoDB ObjectId keys (24 hex chars) with `objectType: "pdf"`, extracting `pdf_name` and `pdf_full` URL fields. PDFs are downloaded directly using the `pdf_full` URLs with cookie-based authentication.

Watermark removal leverages a Python subprocess executing PyPDF2 to parse PDF content streams, removing `/Fm0 Do` XObject references (watermark layers) by filtering PostScript commands. The cleaned PDF replaces the original file.

**Requirements:** Node.js, Python 3, PyPDF2 (`pip install PyPDF2`)



now u have there all pdfs
+ url of video use - 1dm dowload in app in playstore - download the video
or use ffmpeg
or show .hls video dowloader script 

made by unlocked - for educational purpose only (no data ur content is shared)