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

    if os.path.exists(output_file):
        os.remove(output_file)

    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4',
        'outtmpl': output_file,
        'quiet': True
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return send_file(output_file, as_attachment=True)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
