# Thiết Kế Import Kết Quả Phân Tích Từ chat.qwen.ai

## Mục tiêu

Thêm một workflow mới để tận dụng kết quả phân tích video từ `Qwen3.5-Omni-Plus` trên `https://chat.qwen.ai/` và lưu kết quả đó vào SQLite của ứng dụng hiện tại.

- Người dùng vẫn phân tích video trên `chat.qwen.ai`.
- Một browser extension đọc `filename` và JSON kết quả từ giao diện chat.
- Extension gửi dữ liệu sang local backend của app để lưu vào DB.
- Kết quả import được coi như một `video_version` mới, để tiếp tục dùng cho tìm phân cảnh, storyboard, trim, và history như các version hiện có.

Mục tiêu của vòng đầu là import an toàn và nhất quán. Không tự động hóa toàn bộ phiên chat, không thay thế pipeline backend hiện tại, và không tạo hệ lưu trữ riêng.

## Bối cảnh hiện tại

- Ứng dụng hiện có backend FastAPI trong `server/` và frontend React trong `src/`.
- SQLite hiện lưu lịch sử trong `server/data.db`.
- Kết quả phân tích canonical được lưu theo `history -> history_video -> video_version`.
- Keyword search đã được tách riêng và lưu trong `search_result` theo từng `video_version`.
- Frontend hiện đã đọc được danh sách version của mỗi video và dùng version đang chọn cho search, storyboard, trim, và history restore.
- Backend đang có prompt full-analysis chuẩn trong `server/analysis.py` với schema scene chi tiết.

Điểm quan trọng là app đã có mô hình dữ liệu phù hợp để chứa nhiều version phân tích cho cùng một video. Vì vậy, nguồn kết quả từ `chat.qwen.ai` nên đi vào cùng pipeline lưu version thay vì tạo bảng hoặc workflow song song mới.

## Phạm vi vòng đầu

Bao gồm:

- browser extension chạy trên `chat.qwen.ai`
- prompt template chuẩn để Qwen trả đúng schema scene
- local backend import API để nhận kết quả từ extension
- validate chặt JSON scene trước khi lưu
- lưu kết quả import thành `video_version` mới cho video đã tồn tại
- dùng tiếp version đã import trong UI hiện tại mà không cần tách nguồn hiển thị

Không bao gồm:

- tự động upload video lên `chat.qwen.ai`
- tự động gửi prompt hoặc điều khiển toàn bộ chat session
- fuzzy matching hoặc heuristic để map video
- tự động thêm video mới vào `VIDEO_FOLDER` từ extension
- thay đổi UI để hiển thị nguồn `chat.qwen.ai` khác với backend analysis
- tạo schema DB mới chỉ để đánh dấu nguồn phân tích ở vòng đầu

## Hướng tiếp cận được chọn

Chọn hướng `extension -> local import API -> SQLite hiện có`.

### Vì sao chọn hướng này

- Reuse hoàn toàn mô hình lưu trữ version hiện có.
- Giữ scope nhỏ: extension chỉ đọc và gửi kết quả, backend chịu trách nhiệm validate và lưu.
- Tránh phụ thuộc vào session automation hoặc login flow của `chat.qwen.ai`.
- Tránh tạo import flow thủ công nhiều bước trong app chính.

### Các hướng đã cân nhắc

1. `Extension -> local import API`

- Đây là hướng được chọn.
- Extension đọc kết quả đang hiển thị và import thẳng vào backend local.
- Cân bằng tốt giữa tốc độ sử dụng và độ ổn định.

2. `Extension export JSON -> app import thủ công`

- Đơn giản hơn về quyền extension.
- Nhưng trải nghiệm rời rạc và tăng nguy cơ map sai video hoặc dùng sai file JSON.

3. `Backend/local helper tự scrape chat`

- Giảm logic trong extension.
- Nhưng mong manh hơn nhiều vì phụ thuộc DOM, auth state, và vòng đời tab/browser.

## Kiến trúc thành phần

### 1. Browser extension

Extension là lớp tích hợp mỏng chạy trên `chat.qwen.ai`.

Trách nhiệm:

- đọc `filename` của video đang được attach hoặc đang hiển thị trong phiên chat
- đọc câu trả lời assistant mới nhất chứa kết quả phân tích
- parse JSON scenes
- hiển thị trạng thái hợp lệ hoặc không hợp lệ trước khi lưu
- gọi local backend import API

Extension không chịu trách nhiệm phân tích video, không tự upload file, không tự điều khiển chat, và không tự sửa kết quả model.

### 2. Prompt contract chuẩn

Prompt template là hợp đồng dữ liệu giữa `chat.qwen.ai` và app hiện tại.

Trách nhiệm:

- ép model trả `JSON array` đúng shape
- giữ field names trùng với schema app hiện có
- giảm khả năng model trả prose, markdown, hoặc schema lệch

Prompt này phải được coi là một phần của sản phẩm vòng đầu, không phải tài liệu tham khảo tùy ý.

### 3. Local import API

Backend thêm một import endpoint mới để nhận payload từ extension.

Trách nhiệm:

- xác thực payload
- tìm video theo `filename`
- validate từng scene
- tạo hoặc tái sử dụng một import history chuyên dụng cho đúng `filename`
- lưu thành `video_version` mới theo pipeline DB hiện có
- trả về history đã cập nhật để app có thể refresh

### 4. SQLite và UI hiện tại

Kết quả import được coi là một version phân tích bình thường.

- không thêm bảng mới ở vòng đầu
- không phân biệt riêng nguồn hiển thị ở frontend
- version switch, search, storyboard, trim, và history vẫn hoạt động trên version mới như bình thường

## Prompt chuẩn

Vòng đầu cần một prompt cố định để người dùng đưa vào `chat.qwen.ai`.

```text
Analyze the full video and split it into meaningful scenes in chronological order.

Return ONLY a valid JSON array.
Do not include markdown fences.
Do not include any explanation before or after the JSON.

Each item must use this exact shape with all fields present:
{"keyword":"short Vietnamese scene label","start":12.3,"end":18.7,"description":"Vietnamese description","context":"Vietnamese scene context","subjects":["item"],"actions":["item"],"mood":"Vietnamese mood","shot_type":"Vietnamese shot type","marketing_uses":["item"],"relevance_notes":"Vietnamese note"}

Rules:
- Write all text fields in Vietnamese except numbers.
- Keep scene order chronological from start to end.
- `start` and `end` must be numbers in seconds.
- `end` must be greater than or equal to `start`.
- `keyword` must be short and practical for footage search.
- `description` should describe what is visible in the scene.
- `context` should explain the situation or surrounding context of the scene.
- `subjects` should list the main people, objects, or entities appearing.
- `actions` should list the key visible actions in the scene.
- `mood` should describe the emotional tone.
- `shot_type` should describe the shot style, such as cận cảnh, trung cảnh, toàn cảnh, POV, overhead.
- `marketing_uses` should describe how the scene could be used in marketing, such as hook, problem, solution, benefit, lifestyle, testimonial, social proof, or cta support.
- `relevance_notes` should briefly explain why the scene is useful or distinctive.
- The scenes must cover the important content of the whole video.
- If no useful scenes can be identified, return [].
```

Prompt này nên được đóng gói trong extension dưới dạng `Copy prompt chuẩn` để tránh mỗi lần dùng lại viết prompt theo kiểu khác nhau.

## Schema scene chuẩn

Mỗi scene phải có đủ các field sau:

- `keyword: string`
- `start: number`
- `end: number`
- `description: string`
- `context: string`
- `subjects: string[]`
- `actions: string[]`
- `mood: string`
- `shot_type: string`
- `marketing_uses: string[]`
- `relevance_notes: string`

Quy tắc normalize và validation:

- mọi string được trim khoảng trắng đầu cuối
- `subjects`, `actions`, `marketing_uses` phải là mảng string
- `start` và `end` phải parse được sang số thực
- `end >= start`
- field thiếu hoặc sai kiểu làm import thất bại ở vòng đầu

Vòng đầu không cố gắng “sửa hộ” output sai. Thiết kế cố ý chọn strict import để bảo toàn độ tin cậy của dữ liệu scene trong DB.

## Luồng dữ liệu

### 1. Phân tích trên chat.qwen.ai

Người dùng mở `chat.qwen.ai`, attach video, và dùng prompt chuẩn để chạy `Qwen3.5-Omni-Plus`.

### 2. Extension đọc dữ liệu từ phiên chat

Extension lấy:

- `filename` của video đang được hiển thị trên chat
- câu trả lời assistant mới nhất
- JSON array scenes sau khi parse thành công

### 3. Extension xác thực cục bộ

Trước khi gửi về backend, extension nên kiểm tra nhanh:

- có đọc được `filename` hay không
- có parse được JSON array hay không
- số scene đọc được là bao nhiêu

Nếu một trong các bước này thất bại thì không cho bấm lưu.

### 4. Extension gọi local backend import API

Payload logic nên gồm:

- `filename`
- `scenes`
- `source = "chat.qwen.ai"`
- tùy chọn: `raw_text` chỉ để log hoặc debug

`raw_text` không phải nguồn dữ liệu chính để lưu. Dữ liệu chuẩn để lưu luôn là `scenes` đã parse thành công.

### 5. Backend validate và lưu DB

Backend thực hiện theo thứ tự:

1. xác nhận video tồn tại theo `filename`
2. validate schema scenes
3. tạo hoặc tái sử dụng một history chuyên dụng cho import của chính `filename` đó
4. tạo `video_version` mới
5. cập nhật `history_video.current_version_index` để version mới trở thành version đang chọn của video đó
6. trả về history item đã cập nhật

### 6. App reload state

Frontend app chính chỉ cần refresh history hoặc reload video state để thấy version mới. Không cần mode UI mới chỉ cho import.

## Quy tắc map video theo filename

Vòng đầu chỉ map theo `exact filename` đọc từ `chat.qwen.ai`.

Quy tắc:

- so khớp theo basename filename
- trên Windows có thể xử lý case-insensitive
- không fuzzy matching
- không đoán gần đúng
- không map theo thời lượng, metadata, hoặc text similarity

Nếu filename không tồn tại trong thư viện video hiện tại thì import bị từ chối.

Lý do:

- deterministic
- dễ giải thích cho người dùng
- ít nguy cơ lưu nhầm phân tích sang video khác
- khớp với hệ video hiện tại vốn dựa trên `VIDEO_FOLDER` và `filename`

## API import đề xuất

Endpoint gợi ý:

- `POST /api/import-analysis`

Request body gợi ý:

```json
{
  "filename": "video-01.mp4",
  "source": "chat.qwen.ai",
  "scenes": [
    {
      "keyword": "mở hộp sản phẩm",
      "start": 0.0,
      "end": 3.2,
      "description": "...",
      "context": "...",
      "subjects": ["..."],
      "actions": ["..."],
      "mood": "...",
      "shot_type": "...",
      "marketing_uses": ["..."],
      "relevance_notes": "..."
    }
  ]
}
```

Response body gợi ý:

```json
{
  "history": {"id": "..."},
  "version_id": "1712345678901"
}
```

Thiết kế logic:

- vòng đầu chưa cần hiển thị `source` ở UI
- nhưng cho phép gửi `source` trong request để giữ chỗ cho logging hoặc metadata về sau
- backend không nên phụ thuộc vào `raw_text` để parse lại ở vòng đầu

## Hành vi lưu DB

Khi import thành công:

- backend tạo hoặc tái sử dụng một history chuyên dụng cho từng `filename` import từ extension
- tạo `video_version` mới cho video tương ứng
- không ghi đè version cũ
- version mới trở thành version đang chọn của video đó
- search result cũ của các version khác vẫn được giữ nguyên

Quy tắc history này được chọn để tránh mơ hồ khi cùng một `filename` đã từng xuất hiện trong nhiều history item khác nhau của app.

- nếu import tiếp cùng một `filename`, backend append version mới vào đúng import history đã có của filename đó
- nếu đây là lần import đầu tiên của `filename`, backend tạo một history mới chỉ chứa video đó
- import history không cần trộn vào các history được tạo từ flow analyze trong app, vì việc trộn theo `filename` vào history gần nhất sẽ khó đoán và dễ gây sai ngữ cảnh

Thiết kế này làm cho import từ `chat.qwen.ai` trở thành một nguồn tạo version khác, nhưng không thay đổi các giả định hiện có của app về versioning.

## Xử lý lỗi

### 1. Không đọc được filename trên chat.qwen.ai

- extension báo lỗi rõ ràng
- không gọi import API

### 2. JSON không parse được

- extension báo output không đúng prompt contract
- không gọi import API

### 3. JSON parse được nhưng schema sai

- backend reject import
- trả lỗi cụ thể theo field hoặc scene invalid đầu tiên

### 4. Không tìm thấy video theo filename

- backend reject import với thông báo video chưa tồn tại trong thư viện hiện tại

### 5. Lưu DB thất bại

- backend trả lỗi 5xx
- extension báo import thất bại, không giả định rằng version đã được tạo

### 6. Import thành công nhưng app chưa refresh

- không làm hỏng DB
- chỉ cần refresh history để nhìn thấy version mới

## UX của extension

Extension cung cấp 5 thành phần chính trong popup:

### 1. Copy prompt chuẩn

- cung cấp prompt cố định cho người dùng paste vào chat
- prompt đã được nhúng sẵn trong extension

### 2. Kiểm tra kết quả (Check current result)

- đọc **tất cả** câu trả lời assistant trong phiên chat hiện tại
- parse từng JSON response riêng biệt
- loại bỏ bản trùng bằng signature (scene count + first/last keyword)
- hiển thị filename đang map tới và số scene đọc được
- nếu phiên chat có nhiều JSON response → hiện dropdown "Response" cho người dùng chọn
- nếu filename không detect được → hiện input thủ công với datalist gợi ý từ backend

### 3. Preview panel (2 tabs)

Preview cho phép xem toàn bộ dữ liệu JSON trước khi lưu:

#### Tab Scenes (visual)
- hiển thị danh sách scene cards, mỗi card gồm: index, keyword, timing (start → end)
- click vào scene card để expand xem toàn bộ fields: description, context, mood, shot_type, subjects, actions, marketing_uses, relevance_notes
- tags hiển thị dạng chip cho subjects, actions, marketing_uses
- click lần nữa để collapse

#### Tab Raw JSON
- hiển thị toàn bộ JSON raw data trong format monospace
- cho phép verify dữ liệu chính xác trước khi import
- hữu ích khi cần copy/paste hoặc debug

### 4. Response selector (cho multi-response chat)

- khi phiên chat có nhiều JSON array (ví dụ: phân tích lại, nhiều video trong cùng chat)
- dropdown hiển thị: "Response 1 — 8 scene(s)", "Response 2 — 5 scene(s)"
- chọn response khác sẽ cập nhật preview và scene count
- response được sắp xếp theo số scene giảm dần (nhiều nhất lên đầu)

### 5. Lưu vào Footage Finder (Save)

- chỉ bật khi parse hợp lệ và có filename
- gửi payload của response đang chọn sang local backend import API
- hiển thị kết quả thành công hoặc lỗi cụ thể

### Manual filename input

- chat.qwen.ai **không render video filename** vào DOM text (video chỉ hiện dạng thumbnail)
- extension tự động hiện ô nhập manual khi filename không detect được
- input kèm datalist fetch từ `/api/videos` để gợi ý file đã có trong thư viện
- người dùng nhập tên file → click Check lại hoặc nhập rồi Save trực tiếp

## Xử lý DOM chat.qwen.ai

### Đặc thù DOM cần xử lý

- Qwen **không dùng** `<pre>` hoặc `<code>` cho code blocks
- JSON được render bằng hàng trăm `<span>` syntax-highlighted lồng nhau
- Line numbers (1, 2, 3...) được inject vào DOM và merge vào `innerText`
- Container chính là `#chat-messages-scroll-container` hoặc `.chat-messages`
- Không có `data-message-author-role` hoặc attribute phân biệt user/assistant
- Video filename không xuất hiện trong text — chỉ hiện thumbnail với duration

### Chiến lược extract

1. Tìm element có label "json" → scan sibling/parent để lấy code body
2. Scan chat container → tìm div có scene markers
3. Fallback: scan pre/code rồi toàn bộ page
4. Với mỗi candidate text: strip line-number-only lines, bỏ prefix "json", extract `[...]` substring
5. Parse nhiều variant (cleaned, sliced, aggressive strip, fenced block, regex rebuild)
6. Deduplicate kết quả bằng signature trước khi hiển thị

## Ranh giới trách nhiệm

### Extension

- đọc DOM của `chat.qwen.ai`
- strip line numbers và noise từ Qwen code block rendering
- parse tất cả JSON response trong phiên chat
- hiển thị preview và cho phép chọn response
- gửi request import
- hiển thị trạng thái import

### Backend

- validate request
- map filename sang video hiện có
- lưu version mới vào SQLite
- trả history cập nhật

### Frontend app chính

- không cần workflow riêng cho import
- chỉ cần dùng lại history/version hiện có

## Verification

Minimum manual verification sau khi implement:

1. Dùng prompt chuẩn trên `chat.qwen.ai` với một video và xác nhận model trả JSON array hợp lệ.
2. Extension detect và parse được JSON scenes từ code block của Qwen (bao gồm strip line numbers).
3. Với phiên chat có nhiều JSON response: dropdown Response hiển thị đúng số response và scene count.
4. Preview panel hiển thị đúng keyword, timing, và description cho từng scene.
5. Khi filename không detect được: manual input xuất hiện và datalist gợi ý đúng danh sách video.
6. Import thành công tạo ra một `video_version` mới trong DB cho đúng video.
7. Reload app và xác nhận version mới xuất hiện trong history/video versions.
8. Chạy keyword search trên version vừa import và xác nhận app dùng được scenes đã lưu.
9. Xác nhận storyboard có thể lấy version vừa import làm candidate scenes.
10. Xác nhận trim/export vẫn hoạt động trên scenes của version vừa import.
11. Kiểm tra lỗi rõ ràng cho các case: không tìm thấy JSON, JSON parse lỗi, filename không tồn tại trong thư viện.

## Scope check

Spec này tập trung vào một sub-project đủ gọn cho một implementation plan:

- tạo extension import bán tự động với preview và multi-response support
- tạo import API ở backend
- nối kết quả vào hệ version hiện có
- xử lý đặc thù DOM của chat.qwen.ai (line numbers, no filename, no pre/code)

Spec không ôm thêm các bài toán lớn hơn như session automation, upload đồng bộ hai nơi, hoặc đồng bộ prompt/model settings giữa app và `chat.qwen.ai` beyond prompt template chuẩn.

Vì vậy phạm vi này phù hợp để đi tiếp sang implementation plan riêng.
