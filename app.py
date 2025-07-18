from flask import Flask, request, send_file, jsonify
import yt_dlp
import os
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/download')
def download():
    url = request.args.get('url')
    quality = request.args.get('quality', 'best')

    if not url:
        return jsonify({'error': 'Missing URL parameter'}), 400

    output_file = 'video.mp4'

    if os.path.exists(output_file):
        os.remove(output_file)

    if quality == 'standard':
        ydl_format = 'worst[ext=mp4]'
    else:
        ydl_format = 'best[ext=mp4]'

    ydl_opts = {
        'format': ydl_format,
        'outtmpl': output_file,
        'quiet': True,
        'cookiefile': 'cookies.txt'
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        # Generate a safe filename from the video title
        title = info.get('title', 'download')
        title = ''.join(c for c in title if c.isalnum() or c in ' _-').rstrip()
        title = title[:60]  # Truncate if too long
        filename = f"{title}.mp4"

        return send_file(output_file, as_attachment=True, download_name=filename)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
