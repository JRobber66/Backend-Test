from flask import Flask, request, send_file, jsonify
import yt_dlp
import os

app = Flask(__name__)

@app.route('/download')
def download():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'Missing URL parameter'}), 400

    output_file = 'video.mp4'

    # Remove previous file if exists
    if os.path.exists(output_file):
        os.remove(output_file)

    # yt-dlp options to avoid needing ffmpeg
    ydl_opts = {
        'format': 'mp4',
        'outtmpl': output_file,
        'quiet': True,
        'cookiefile': 'cookies.txt',
        'merge_output_format': 'mp4'
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return send_file(output_file, as_attachment=True)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
