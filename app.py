from flask import Flask, request, jsonify, Response
import yt_dlp
import os
import imageio_ffmpeg
from flask_cors import CORS

os.environ["PATH"] += os.pathsep + os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())

app = Flask(__name__)
CORS(app)

def stream_file(file_path, filename):
    def generate():
        with open(file_path, 'rb') as f:
            while True:
                chunk = f.read(4096)
                if not chunk:
                    break
                yield chunk

    response = Response(generate(), mimetype='application/octet-stream')
    response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response

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
            info = ydl.extract_info(url, download=True)

        title = info.get('title', 'download')
        title = ''.join(c for c in title if c.isalnum() or c in ' _-').rstrip()
        title = title[:60]
        filename = f"{title}.mp4" if quality != 'audio' else f"{title}.m4a"

        # Rename file physically
        if os.path.exists(filename):
            os.remove(filename)
        os.rename(output_file, filename)

        # Stream file with forced filename
        return stream_file(filename, filename)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/info')
def get_info():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'Missing URL parameter'}), 400

    try:
        ydl_opts = {'quiet': True, 'cookiefile': 'cookies.txt'}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        return jsonify({
            'title': info.get('title', 'Unknown Title'),
            'thumbnail': info.get('thumbnail', '')
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
