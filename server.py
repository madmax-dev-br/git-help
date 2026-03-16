#!/usr/bin/env python3
"""Simple dev server that serves static files and proxies GitLab API requests to bypass CORS."""

import http.server
import json
import os
import shutil
import subprocess
import tempfile
import threading
import urllib.request
import urllib.error
import urllib.parse

PORT = 8080
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        if self.path.startswith('/proxy'):
            self._proxy()
        else:
            super().do_GET()

    def do_POST(self):
        print(f'[DEBUG] POST path: {self.path}')
        if self.path.startswith('/proxy'):
            self._proxy()
        elif self.path == '/setup':
            self._setup()
        elif self.path == '/merge-back':
            self._merge_back()
        else:
            self.send_error(404)

    def do_PUT(self):
        if self.path.startswith('/proxy'):
            self._proxy()
        else:
            self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith('/proxy'):
            self._proxy()
        else:
            self.send_error(404)

    def _setup(self):
        content_length = self.headers.get('Content-Length')
        if not content_length:
            self._json_response(400, {'error': 'Missing body'})
            return

        body = json.loads(self.rfile.read(int(content_length)))
        project_path = body.get('projectPath', '').strip()

        if not project_path or not os.path.isdir(project_path):
            self._json_response(400, {'error': 'Invalid project path'})
            return

        # Read local.properties for token
        props_path = os.path.join(project_path, 'local.properties')
        if not os.path.isfile(props_path):
            self._json_response(400, {'error': 'local.properties not found in project'})
            return

        token = None
        with open(props_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line.startswith('GITLAB_ACCESS_TOKEN='):
                    token = line.split('=', 1)[1].strip()
                    break

        if not token:
            self._json_response(400, {'error': 'GITLAB_ACCESS_TOKEN not found in local.properties'})
            return

        # Read optional .sdui-tools configs
        tools_dir = os.path.join(project_path, '.sdui-tools')
        pipeline_config = None

        compare_config = None

        if os.path.isdir(tools_dir):
            pipelines_path = os.path.join(tools_dir, 'pipelines.json')
            if os.path.isfile(pipelines_path):
                try:
                    with open(pipelines_path, 'r') as f:
                        pipeline_config = json.load(f)
                except Exception:
                    pass

            compare_path = os.path.join(tools_dir, 'compare.json')
            if os.path.isfile(compare_path):
                try:
                    with open(compare_path, 'r') as f:
                        compare_config = json.load(f)
                except Exception:
                    pass

        self._json_response(200, {
            'token': token,
            'pipelineConfig': pipeline_config,
            'compareConfig': compare_config,
        })

    def _merge_back(self):
        content_length = self.headers.get('Content-Length')
        if not content_length:
            self._json_response(400, {'error': 'Missing body'})
            return

        body = json.loads(self.rfile.read(int(content_length)))
        clone_url = body.get('cloneUrl', '').strip()
        source = body.get('source', '').strip()
        target = body.get('target', '').strip()
        token = body.get('token', '').strip()
        project_name = body.get('projectName', 'project')

        if not clone_url or not source or not target or not token:
            self._json_response(400, {'error': 'Missing required fields: cloneUrl, source, target, token'})
            return

        # Inject token into clone URL for auth: https://oauth2:TOKEN@gitlab.com/...
        if clone_url.startswith('https://'):
            auth_url = clone_url.replace('https://', f'https://oauth2:{token}@', 1)
        elif clone_url.startswith('http://'):
            auth_url = clone_url.replace('http://', f'http://oauth2:{token}@', 1)
        else:
            auth_url = clone_url

        result = self._merge_back_worker(auth_url, source, target, project_name, None)
        code = 200 if result.get('status') == 'success' else (409 if result.get('status') == 'conflict' else 500)
        self._json_response(code, result)

    def _merge_back_worker(self, auth_url, source, target, project_name, task_id):
        """Run git clone, merge, push in a temp dir."""
        tmp_dir = None
        result = {'taskId': task_id, 'project': project_name}
        try:
            tmp_dir = tempfile.mkdtemp(prefix=f'mergeback_{project_name}_')

            # Shallow clone with only the two branches we need
            subprocess.run(
                ['git', 'clone', '--depth', '1', '--no-single-branch',
                 '--branch', target, auth_url, tmp_dir],
                check=True, capture_output=True, text=True, timeout=120
            )

            # Fetch source branch (shallow)
            subprocess.run(
                ['git', 'fetch', 'origin', f'{source}:{source}', '--depth', '1'],
                cwd=tmp_dir, check=True, capture_output=True, text=True, timeout=60
            )

            # Checkout target
            subprocess.run(
                ['git', 'checkout', target],
                cwd=tmp_dir, check=True, capture_output=True, text=True, timeout=30
            )

            # Merge source into target
            merge_result = subprocess.run(
                ['git', 'merge', source, '-m', f'Merge back {source} into {target}'],
                cwd=tmp_dir, capture_output=True, text=True, timeout=60
            )

            if merge_result.returncode != 0:
                # Merge conflict
                subprocess.run(['git', 'merge', '--abort'], cwd=tmp_dir, capture_output=True)
                result['status'] = 'conflict'
                result['error'] = merge_result.stderr or merge_result.stdout
                return result

            # Push
            subprocess.run(
                ['git', 'push', 'origin', target],
                cwd=tmp_dir, check=True, capture_output=True, text=True, timeout=120
            )

            result['status'] = 'success'
            return result

        except subprocess.TimeoutExpired:
            result['status'] = 'failed'
            result['error'] = 'Git operation timed out'
            return result
        except subprocess.CalledProcessError as e:
            result['status'] = 'failed'
            result['error'] = e.stderr or e.stdout or str(e)
            return result
        except Exception as e:
            result['status'] = 'failed'
            result['error'] = str(e)
            return result
        finally:
            if tmp_dir and os.path.isdir(tmp_dir):
                shutil.rmtree(tmp_dir, ignore_errors=True)

    def _json_response(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self):
        # /proxy/<base64_gitlab_url>/api/v4/...
        # We pass the target URL as a query param: /proxy?url=<encoded_full_url>
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        target_url = qs.get('url', [None])[0]

        if not target_url:
            self.send_error(400, 'Missing url param')
            return

        # Read body for POST/PUT
        body = None
        content_length = self.headers.get('Content-Length')
        if content_length:
            body = self.rfile.read(int(content_length))

        # Forward headers we care about
        headers = {}
        if self.headers.get('Content-Type'):
            headers['Content-Type'] = self.headers['Content-Type']

        req = urllib.request.Request(target_url, data=body, headers=headers, method=self.command)

        try:
            with urllib.request.urlopen(req) as resp:
                resp_body = resp.read()
                self.send_response(resp.status)
                # Forward relevant headers
                for h in ['Content-Type', 'X-Next-Page', 'X-Total-Pages', 'X-Total']:
                    val = resp.getheader(h)
                    if val:
                        self.send_header(h, val)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(resp_body)
        except urllib.error.HTTPError as e:
            resp_body = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(resp_body)
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


if __name__ == '__main__':
    print(f'Server running at http://localhost:{PORT}')
    server = http.server.HTTPServer(('', PORT), Handler)
    server.serve_forever()
