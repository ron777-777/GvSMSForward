# 编码助手 (app.py) [最终正确版 - 最新的在最上方]
#
# 这是一个 Python Flask 服务器，用于：
# 1. 接收来自 Google Apps Script 的短信数据 (POST /api/new-sms)
# 2. 存储这些短信（在内存中，最多 50 条）
# 3. 提供一个 API 供前端网页获取这些短信 (GET /api/get-messages)
# 4. 托管前端 index.html 页面 (GET /)
#
import os
import datetime
from flask import Flask, request, jsonify, send_from_directory, abort

# --- 配置 ---
app = Flask(__name__)

# 我们的“内存数据库”
received_messages = []
MAX_MESSAGES = 50 # (您可以按需修改这个数字)

# --- API 路由 (Endpoints) ---

@app.route('/api/new-sms', methods=['POST'])
def handle_new_sms():
    """
    [POST] /api/new-sms
    接收来自 Google Apps Script 的新短信
    """
    print("收到了来自 GAS 的 POST 请求...")

    try:
        # 1. 确保请求是 JSON
        if not request.is_json:
            print('错误：请求不是 JSON')
            abort(400, description="请求体必须是 JSON 格式")

        data = request.json

        # 2. 验证（我们现在要求 GAS 必须发送 originalTimestamp）
        if 'from' not in data or 'message' not in data or 'originalTimestamp' not in data:
            print('错误：请求数据格式错误，缺少 from, message, 或 originalTimestamp')
            abort(400, description="请求体必须包含 from, message 和 originalTimestamp 字段。")

        # 3. 创建新消息
        new_message = {
            "sender": data['from'],
            "content": data['message'],
            "receivedAt": data['originalTimestamp'] # <-- 使用 GAS 发来的时间
        }

        # 4. [!!! 关键代码 !!!]
        # 存入“数据库” (插入到列表头部)
        received_messages.insert(0, new_message)

        # 5. [!!! 关键代码 !!!]
        # 保持数组大小 (从末尾移除最旧的)
        if len(received_messages) > MAX_MESSAGES:
            received_messages.pop() # 移除最旧的一条

        print(f"新短信已存储: {new_message['sender']}")
        return jsonify({"success": True, "message": "短信已接收"}), 201

    except Exception as e:
        # 捕获所有意外错误
        print(f"处理请求时出错: {e}")
        abort(500, description="服务器内部错误")

@app.route('/api/get-messages', methods=['GET'])
def get_messages():
    """
    [GET] /api/get-messages
    供您的前端网站调用，获取所有已存储的短信
    """
    print("前端正在请求短信列表...")
    return jsonify(received_messages)

# --- 前端页面服务 ---

static_folder_path = os.path.join(os.path.dirname(__file__), 'static')

@app.route('/', methods=['GET'])
def serve_index():
    """
    [GET] /
    提供 index.html 页面
    """
    print("正在提供 index.html")
    if not os.path.exists(os.path.join(static_folder_path, 'index.html')):
        print("错误: static/index.html 文件未找到")
        return "index.html not found", 404
    return send_from_directory('static', 'index.html')

@app.route('/<path:path>')
def serve_static_files(path):
    """
    处理 static 文件夹中的其他文件 (如 css, js, 图片)
    """
    return send_from_directory('static', path)


# --- 启动 (仅用于本地测试，生产环境请使用 Gunicorn) ---
if __name__ == '__main__':
    # 运行 'python3 app.py' 时会进入这里
    print("正在以开发模式启动服务器 (Flask)...")
    app.run(host='0.0.0.0', port=5000, debug=True)