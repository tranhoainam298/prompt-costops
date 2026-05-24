Hướng Dẫn Chạy Thử Nghiệm Dự Án CostOps
Dự án CostOps (AI Prompt Optimization & Cost Management Gateway) hiện đã được bổ sung đầy đủ các tệp cấu hình cần thiết để có thể chạy trực tiếp một cách dễ dàng.

Dưới đây là 2 cách để bạn có thể chạy thử nghiệm dự án trên máy Windows.

🛠️ Chuẩn Bị File .env (Bắt Buộc)
Trước khi chạy bằng bất kỳ cách nào, hãy tạo tệp .env tại thư mục gốc của dự án (d:\system integration\costop\costops-dev\.env) bằng cách sao chép tệp cấu hình mẫu:

powershell

# Chạy lệnh trong PowerShell tại thư mục gốc d:\system integration\costop\costops-dev\
Copy-Item .env.example .env
Sau đó, mở tệp .env mới tạo và điền các API Key của bạn (nếu có):

OPENAI_API_KEY: Key của OpenAI để kiểm tra Proxy
ANTHROPIC_API_KEY: Key của Anthropic (Claude)
DEEPSEEK_API_KEY: Key của DeepSeek
(Lưu ý: Nếu không điền API Key thực tế, bạn vẫn có thể chạy và gọi các API khác, nhưng các yêu cầu chat proxy sẽ trả về thông tin giả lập hoặc lỗi từ phía nhà cung cấp).

🐳 Cách 1: Chạy Toàn Bộ Dự Án Qua Docker Compose (Khuyên Dùng)
Nhờ các Dockerfile và cấu hình package.json vừa được hoàn thiện, bạn có thể khởi động toàn bộ môi trường chỉ với một câu lệnh duy nhất.

Bước 1: Khởi động các dịch vụ
Di chuyển vào thư mục infra và khởi chạy Docker Compose:

powershell

cd "d:\system integration\costop\costops-dev\infra"
docker-compose up --build -d
Lệnh này sẽ:

Tải và chạy PostgreSQL 16 (cơ sở dữ liệu) và Redis 7 (bộ nhớ cache, rate limiter).
Tự động xây dựng Container cho Gateway (FastAPI) và Backend (NestJS).
Cấu hình Nginx làm Reverse Proxy điều phối lưu lượng.
Bước 2: Chạy Frontend (Vite) ở Local
Để tiện phát triển và thử nghiệm giao diện:

powershell

cd "d:\system integration\costop\costops-dev\frontend"
npm install
npm run dev
Giao diện Dashboard & Playground: Truy cập tại http://localhost:5173
Tài liệu API (Interactive Swagger): Truy cập tại http://localhost:8000/v1/docs
💻 Cách 2: Chạy Thủ Công (Không Cần Container Cho Ứng Dụng)
Nếu bạn không muốn chạy Gateway và Backend bên trong Docker, bạn có thể chạy PostgreSQL + Redis bằng Docker, sau đó khởi chạy ứng dụng trực tiếp bằng môi trường Python và Node.js cục bộ.

Bước 1: Chạy Database & Redis bằng Docker
Chỉ khởi chạy Postgres và Redis để làm nền tảng lưu trữ:

powershell

cd "d:\system integration\costop\costops-dev\infra"
docker-compose up -d postgres redis
Bước 2: Chạy Gateway (Python FastAPI)
Mở một cửa sổ terminal mới và chạy:

powershell

cd "d:\system integration\costop\costops-dev\gateway"
# 1. Tạo môi trường ảo Python
python -m venv venv
.\venv\Scripts\Activate.ps1
# 2. Cài đặt các thư viện cần thiết
pip install -r requirements.txt
# 3. Khởi chạy Gateway
python main.py
Gateway sẽ chạy tại: http://localhost:8000. Toàn bộ các bảng trong cơ sở dữ liệu sẽ tự động được khởi tạo (Base.metadata.create_all) nhờ cơ chế Lifespan.

Bước 3: Chạy Backend (NestJS)
Mở một cửa sổ terminal mới và chạy:

powershell

cd "d:\system integration\costop\costops-dev\backend"
npm install
npm run start:dev
Backend sẽ chạy tại: http://localhost:3000

Bước 4: Chạy Frontend (React + Vite)
Mở một cửa sổ terminal mới và chạy:

powershell

cd "d:\system integration\costop\costops-dev\frontend"
npm install
npm run dev
Frontend sẽ chạy tại: http://localhost:5173 và tự động proxy các request /v1 sang Gateway, /api sang Backend.

🧪 Cách Kiểm Tra Hoạt Động (Testing)
Khi dự án đã chạy, bạn có thể truy cập http://localhost:5173 để xem giao diện Dashboard cực kỳ cao cấp với thiết kế Dark Glassmorphism, hoặc chuyển sang tab Playground để nhập prompt và kiểm tra khả năng tối ưu hóa chi phí & streaming trực tiếp!

Bạn cũng có thể gọi thử API bằng curl thông qua PowerShell:

powershell

Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get
Kết quả trả về:

json

{
  "status": "ok",
  "service": "costops-gateway"
}
