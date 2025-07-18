from flask import Flask, request, jsonify, Response, session, redirect
import yt_dlp
import os
import imageio_ffmpeg
from flask_cors import CORS

API_KEY = 'xQk!39vd$2P0L7ab8wZ*Vn@1Ff9Rb6Yp'

app = Flask(__name__)
app.secret_key = 'random_admin_session_key_290qv!zzf'

ADMIN_USERNAME = 'admin'
ADMIN_PASSWORD = 'password'

CORS(app)

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True  # Only if your backend uses HTTPS

os.environ["PATH"] += os.pathsep + os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())

# ========== Downloader Routes ==========

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
        return stream_file(filename, filename)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/info')
def get_info():
    if request.args.get('key') != API_KEY:
        return jsonify({'error': 'Unauthorized'}), 401

    url = request.args.get('url')
    quality = request.args.get('quality', '1080p')
    if not url:
        return jsonify({'error': 'Missing URL parameter'}), 400

    try:
        ydl_opts = {
            'quiet': True,
            'cookiefile': 'cookies.txt',
            'extractor_args': {'youtubetab': ['skip=authcheck']}
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        total_size = 0

        def get_matching_size(entry):
            formats = entry.get('formats', [])
            if quality == 'audio':
                target_formats = [f for f in formats if f.get('vcodec') == 'none']
            else:
                target_formats = [f for f in formats if f.get('height') == int(quality.replace('p', ''))]
            sizes = [f.get('filesize') or f.get('filesize_approx') for f in target_formats if f.get('filesize') or f.get('filesize_approx')]
            return max(sizes) if sizes else 0

        if 'entries' in info:
            for entry in info['entries']:
                total_size += get_matching_size(entry)
        else:
            total_size = get_matching_size(info)

        return jsonify({
            'title': info.get('title', 'Unknown Title'),
            'thumbnail': info.get('thumbnail', ''),
            'filesize': total_size
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ========== Admin Panel & Auth ==========

@app.route('/admin', methods=['POST'])
def admin_authenticate():
    data = request.get_json()
    username = str(data.get('username', '')).strip().lower()
    password = str(data.get('password', '')).strip().lower()

    print(f"[LOGIN DEBUG] Username received: '{username}'")
    print(f"[LOGIN DEBUG] Password received: '{password}'")

    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        session['admin_authenticated'] = True
        print("[LOGIN DEBUG] ADMIN LOGIN SUCCESSFUL")
        return jsonify({'status': 'success'})
    else:
        print("[LOGIN DEBUG] ADMIN LOGIN FAILED")
        return jsonify({'error': 'Unauthorized'}), 401

@app.route('/admin-panel')
def admin_panel():
    if session.get('admin_authenticated'):
        return '''
            <!DOCTYPE html>
            <html>
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
                <a href="/logout">Logout</a>
            </body>
            </html>
        '''
    else:
        return redirect('/admin-login')

@app.route('/logout')
def logout():
    session.pop('admin_authenticated', None)
    return redirect('/admin-login')

@app.route('/admin-login')
def admin_login_page():
    return '🔒 Unauthorized - Admin login required (static page only)', 403

# Run it
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
