from flask import Flask, request, jsonify, Response, session, redirect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import yt_dlp
import os
import imageio_ffmpeg
from flask_cors import CORS
from datetime import datetime
import json

# ===== Flask App Setup =====

app = Flask(__name__)
app.secret_key = 'random_admin_session_key_290qv!zzf'

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'

CORS(app, supports_credentials=True)

limiter = Limiter(get_remote_address, app=app)

API_KEY = 'xQk!39vd$2P0L7ab8wZ*Vn@1Ff9Rb6Yp'
ADMIN_USERNAME = 'jrobber66'  # Case-insensitive
ADMIN_PASSWORD = 'x<3Punky0623x'  # Case-sensitive

os.environ["PATH"] += os.pathsep + os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())

# ===== Download History =====

download_history = []

def save_history_to_file():
    with open('download_history.json', 'w') as logfile:
        json.dump(download_history, logfile, indent=2)


# ===== Downloader Routes =====

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

@app.route('/download')
def download():
    if request.args.get('key') != API_KEY:
        return jsonify({'error': 'Unauthorized'}), 401

    url = request.args.get('url')
    quality = request.args.get('quality', '1080p')

    if not url:
        return jsonify({'error': 'Missing URL parameter'}), 400

    output_file = 'video.mp4'

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
        postprocessors = [{'key': 'FFmpegVideoConvertor', 'preferedformat': 'mp4'}]

    ydl_opts = {
        'format': ydl_format,
        'outtmpl': output_file,
        'quiet': True,
        'cookiefile': 'cookies.txt',
        'merge_output_format': merge_format,
        'ffmpeg_location': imageio_ffmpeg.get_ffmpeg_exe(),
        'postprocessors': postprocessors,
        'extractor_args': {'youtubetab': ['skip=authcheck']}
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)

        title = info.get('title', 'download')
        title = ''.join(c for c in title if c.isalnum() or c in ' _-').rstrip()
        title = title[:60]
        filename = f"{title}.mp4" if quality != 'audio' else f"{title}.m4a"

        os.rename(output_file, filename)

        client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        download_history.append({
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'url': url,
            'ip': client_ip
        })
        save_history_to_file()

        return stream_file(filename, filename)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ===== Admin Routes =====

@limiter.limit("5 per minute")
@app.route('/admin', methods=['POST'])
def admin_authenticate():
    data = request.get_json()
    username = str(data.get('username', '')).strip().lower()
    password = str(data.get('password', '')).strip()

    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        session['admin_authenticated'] = True
        return jsonify({'status': 'success'})
    else:
        return jsonify({'error': 'Unauthorized'}), 401

@app.route('/admin-panel')
def admin_panel():
    if session.get('admin_authenticated'):
        return '''
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Admin Panel</title>
                <style>
                    body { font-family: Arial; text-align: center; margin-top: 50px; background-color: #f0f0f0; }
                </style>
            </head>
            <body>
                <h1>Admin Panel</h1>
                <p>Welcome, administrator. You are authenticated.</p>
                <p><a href="/admin-history">View Download History</a></p>
                <p><a href="/logout">Logout</a></p>
            </body>
            </html>
        '''
    else:
        return redirect('/admin-login')

@app.route('/admin-history')
def view_download_history():
    if session.get('admin_authenticated'):
        return jsonify(download_history)
    else:
        return redirect('/admin-login')

@app.route('/logout')
def logout():
    session.pop('admin_authenticated', None)
    return redirect('/admin-login')

@app.route('/admin-login')
def admin_login_page():
    return '🔒 Unauthorized - Admin login required (static page only)', 403


# ===== Launch Server =====

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
