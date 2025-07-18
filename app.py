from flask import Flask, request, jsonify, Response
import yt_dlp
import os
import imageio_ffmpeg
from flask_cors import CORS
import threading

API_KEY = 'super_secret_key_123'

os.environ["PATH"] += os.pathsep + os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())

app = Flask(__name__)
CORS(app)

progress_data = {}

def stream_file(file_path, filename):
    def generate():
        with open(file_path, 'rb') as f:
            while True:
                chunk = f.read(4096)
                if not chunk:
                    break
                yield chunk
        os.remove(file_path)

    response = Response(generate(), mimetype='application/octet-stream')
    response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response

def cleanup_file(filename, delay=60):
    def delete_file():
        try:
            os.remove(filename)
        except:
            pass
    threading.Timer(delay, delete_file).start()

@app.route('/download')
def download():
    if request.args.get('key') != API_KEY:
        return jsonify({'error': 'Unauthorized'}), 401

    url = request.args.get('url')
    quality = request.args.get('quality', '1080p')
    task_id = request.args.get('task', 'default')

    if not url:
        return jsonify({'error': 'Missing URL parameter'}), 400

    output_file = f'{task_id}_video.mp4'

    if quality == 'audio':
        ydl_format = 'bestaudio[ext=m4a]/bestaudio'
        output_file = f'{task_id}_audio.m4a'
        merge_format = 'm4a'
        postprocessors = []
    else:
        ydl_format = (
            'bestvideo[height<=1080][ext=mp4][vcodec!*=av01]+bestaudio[ext=m4a]/'
            'best[height<=1080][ext=mp4]'
        )
        merge_format = 'mp4'
        postprocessors = [{
            'key': 'FFmpegVideoConvertor',
            'preferedformat': 'mp4'
        }]

    progress_data[task_id] = 'Starting...'

    def hook(d):
        if d['status'] == 'downloading':
            progress_data[task_id] = d.get('_percent_str', '').strip()

    ydl_opts = {
        'format': ydl_format,
        'outtmpl': output_file,
        'quiet': True,
        'cookiefile': 'cookies.txt',
        'merge_output_format': merge_format,
        'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(),
        'postprocessors': postprocessors,
        'progress_hooks': [hook]
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        title = info.get('title', 'download')
        title = ''.join(c for c in title if c.isalnum() or c in ' _-').rstrip()
        title = title[:60]
        filename = f"{title}.mp4" if quality != 'audio' else f"{title}.m4a"

        os.rename(output_file, filename)

        progress_data.pop(task_id, None)
        cleanup_file(filename)

        return stream_file(filename, filename)

    except Exception as e:
        progress_data.pop(task_id, None)
        return jsonify({'error': str(e)}), 500

@app.route('/progress')
def get_progress():
    if request.args.get('key') != API_KEY:
        return jsonify({'error': 'Unauthorized'}), 401

    task_id = request.args.get('task', 'default')
    return jsonify({'progress': progress_data.get(task_id, 'Idle')})

@app.route('/info')
def get_info():
    if request.args.get('key') != API_KEY:
        return jsonify({'error': 'Unauthorized'}), 401

    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'Missing URL parameter'}), 400

    try:
        ydl_opts = {'quiet': True, 'cookiefile': 'cookies.txt'}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        return jsonify({
            'title': info.get('title', 'Unknown Title'),
            'thumbnail': info.get('thumbnail', ''),
            'filesize': info.get('filesize_approx', 0)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
