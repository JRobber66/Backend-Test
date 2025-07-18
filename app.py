from flask import Flask, request, send_file, jsonify
import yt_dlp
import os
import imageio_ffmpeg
from flask_cors import CORS

os.environ["PATH"] += os.pathsep + os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())

app = Flask(__name__)
CORS(app)

@app.route('/download')
def download():
    url = request.args.get('url')
    quality = request.args.get('quality', '1080p')

    if not url:
        return jsonify({'error': 'Missing URL parameter'}), 400

    output_file = 'video.mp4'

    if os.path.exists(output_file):
        os.remove(output_file)

    if quality == 'audio':
        ydl_format = 'bestaudio[ext=m4a]/bestaudio'
        output_file = 'audio.m4a'
        merge_format = 'm4a'
        postprocessors = []
    else:
        if quality == '1080p':
            ydl_format = 'bestvideo[height<=1080][ext=mp4][vcodec!*=av01]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]'
        elif quality == '720p':
            ydl_format = 'bestvideo[height<=720][ext=mp4][vcodec!*=av01]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]'
        elif quality == '480p':
            ydl_format = 'bestvideo[height<=480][ext=mp4][vcodec!*=av01]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]'
        else:
            ydl_format = 'best[ext=mp4]'

        merge_format = 'mp4'
        postprocessors = [{
            'key': 'FFmpegVideoConvertor',
            'preferedformat': 'mp4'
        }]

    ydl_opts = {
        'format': ydl_format,
        'outtmpl': output_file,
        'quiet': True,
        'cookiefile': 'cookies.txt',
        'merge_output_format': merge_format,
        'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(),
        'postprocessors': postprocessors
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        return send_file(output_file, as_attachment=True)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
