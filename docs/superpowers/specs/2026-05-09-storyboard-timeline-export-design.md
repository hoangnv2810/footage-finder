# Thiết Kế Bản Dựng Timeline Và Xuất Clip Cho Storyboard

## Mục Tiêu

Thêm nhiều bản dựng timeline cho từng storyboard đã lưu để một storyboard có thể tạo nhiều phương án video khác nhau từ các footage match. Mỗi bản dựng giữ danh sách clip riêng và xuất thành nhiều file MP4 rời trong một file ZIP. Luồng làm việc là: viết hoặc import kịch bản, tạo storyboard, chọn footage match, tạo một hoặc nhiều bản dựng, kiểm tra timeline của bản dựng, xuất clip rời, rồi kéo sang CapCut hoặc phần mềm dựng khác để edit tiếp.

## Phạm Vi

Thiết kế này chỉ bao gồm phiên bản đầu của tính năng bản dựng timeline và export clip rời cho storyboard đã lưu.

Bao gồm:

- Nhiều bản dựng timeline cho mỗi storyboard đã lưu.
- Lưu timeline vào SQLite.
- Thêm match đã chọn từ storyboard vào timeline.
- Tạo, chọn, đổi tên và xoá bản dựng timeline.
- Đổi thứ tự và xoá clip trong timeline.
- Xuất từng bản dựng timeline thành file `.zip` gồm nhiều file MP4 rời.
- Tên file export có thứ tự, label, video gốc và khoảng thời gian.

Không bao gồm trong phiên bản này:

- Giỏ clip global dùng chung cho Search, Library và Storyboard.
- Ghép tất cả clip thành một video hoàn chỉnh.
- Multi-track editing, transition, mix âm thanh, phụ đề hoặc overlay.
- Bản dựng timeline cho storyboard nháp chưa lưu.

## Hành Vi Sản Phẩm

Mỗi storyboard đã lưu có thể sở hữu nhiều bản dựng timeline. Khi người dùng chọn storyboard A, app load danh sách bản dựng của storyboard A và chọn bản dựng gần nhất hoặc bản dựng đầu tiên. Khi chọn storyboard B, app load danh sách bản dựng của storyboard B. Nút export chỉ xuất bản dựng timeline đang được chọn.

Bản dựng timeline cần hỗ trợ:

- Tạo bản dựng mới cho storyboard đang mở.
- Chọn bản dựng đang làm việc.
- Đổi tên bản dựng.
- Xoá bản dựng.
- Hiển thị danh sách clip theo thứ tự.
- Thêm một match từ beat đang xem.
- Đưa toàn bộ storyboard vào bản dựng timeline.
- Di chuyển clip lên hoặc xuống.
- Xoá từng clip.
- Xoá toàn bộ clip trong bản dựng.
- Xuất bản dựng thành `.zip`.

Storyboard mới generate nhưng chưa lưu không được âm thầm tạo bản dựng timeline. Nếu storyboard chưa có `storyboard_id`, UI hiển thị thông báo tiếng Việt như `Lưu storyboard để tạo bản dựng`.

## Quy Tắc Chọn Match

Với thao tác `Đưa storyboard vào timeline`, app thêm một clip cho mỗi beat vào bản dựng đang chọn theo đúng thứ tự beat.

Thứ tự ưu tiên khi chọn match:

1. Dùng match đang được chọn hoặc preview cho beat đó nếu có.
2. Nếu chưa có match được chọn, dùng match đầu tiên của beat.
3. Bỏ qua beat không có match.

Nếu bản dựng đang chọn đã có clip trùng `beat_id` và trùng `filename/start/end`, không thêm bản sao. Nếu người dùng chọn một match khác cho cùng beat, vẫn cho thêm như một clip riêng vì họ có thể muốn giữ nhiều phương án footage trong cùng bản dựng.

## Mô Hình Dữ Liệu

Thêm bảng `storyboard_timeline` và `storyboard_timeline_clip`.

### `storyboard_timeline`

Các cột:

- `id`: text primary key.
- `storyboard_id`: text, bắt buộc, tham chiếu `storyboard_project.id`.
- `name`: text, bắt buộc, ví dụ `Bản dựng 1`.
- `position`: integer, bắt buộc, dùng để sắp xếp danh sách bản dựng.
- `created_at`: text timestamp.
- `updated_at`: text timestamp.

### `storyboard_timeline_clip`

Các cột:

- `id`: text primary key.
- `timeline_id`: text, bắt buộc, tham chiếu `storyboard_timeline.id`.
- `beat_id`: text, có thể null vì dữ liệu import có thể thiếu.
- `label`: text, bắt buộc.
- `filename`: text, bắt buộc.
- `start`: real, bắt buộc.
- `end`: real, bắt buộc.
- `scene_index`: integer, có thể null.
- `position`: integer, bắt buộc.
- `created_at`: text timestamp.
- `updated_at`: text timestamp.

Khi xoá storyboard, toàn bộ bản dựng timeline và timeline clip của storyboard đó cũng phải bị xoá. Nếu SQLite foreign-key cascade chưa được bật ổn định, xoá timeline clip và timeline trực tiếp trong `delete_storyboard_project`.

## Backend API

Thêm các endpoint vào FastAPI backend hiện tại.

`GET /api/storyboards/{storyboard_id}/timelines`

Trả về danh sách bản dựng của storyboard, mỗi bản dựng gồm metadata và clip đã sắp xếp theo `position`.

`POST /api/storyboards/{storyboard_id}/timelines`

Tạo bản dựng mới cho storyboard. Nếu frontend không gửi tên, backend dùng tên mặc định như `Bản dựng 1`, `Bản dựng 2`.

`PATCH /api/storyboard-timelines/{timeline_id}`

Đổi tên hoặc đổi thứ tự bản dựng.

`DELETE /api/storyboard-timelines/{timeline_id}`

Xoá một bản dựng và toàn bộ clip trong bản dựng đó.

`PUT /api/storyboard-timelines/{timeline_id}/clips`

Thay toàn bộ clip của bản dựng bằng danh sách clip đã được sắp thứ tự từ frontend. Cách này giúp thao tác thêm, xoá, đổi thứ tự và xoá hết đơn giản hơn, tránh lệch trạng thái giữa client và server.

`POST /api/storyboard-timelines/{timeline_id}/export`

Xuất bản dựng timeline hiện tại thành file ZIP. Server đọc các clip trong timeline, dùng helper ffmpeg trim hiện có để cắt từng clip, ghi MP4 vào thư mục tạm, nén thành ZIP, rồi trả về `FileResponse` và dọn thư mục tạm bằng `BackgroundTask`.

Validation:

- Trả 404 nếu storyboard không tồn tại.
- Trả 404 nếu timeline không tồn tại.
- Trả 400 nếu bản dựng timeline rỗng khi export.
- Trả 400 nếu clip có khoảng thời gian không hợp lệ, ví dụ `end <= start`.
- Trả lỗi nhất quán với `/api/trim` nếu server không có ffmpeg.
- Luôn resolve video path qua `get_video_path` để giữ logic `VIDEO_FOLDER` tập trung một chỗ.

## Format Tên File Export

Tên file ZIP nên dùng format:

`ten-storyboard-ten-ban-dung-clips.zip`

Ví dụ:

`kem-tri-nam-version-1-clips.zip`

Tên clip bên trong ZIP dùng format:

`01_hook_videoA_00-12_00-18.mp4`

Quy tắc:

- Prefix là thứ tự timeline bắt đầu từ 1, pad 2 chữ số cho tới 99 clip.
- Label lấy từ beat label hoặc match label.
- Tên video gốc là filename bỏ phần extension.
- Khoảng thời gian dùng dạng `MM-SS` cho cả start và end.
- Sanitize mọi phần tên file thành slug an toàn, ưu tiên ASCII.
- Nếu thiếu label, dùng `beat-1`, `beat-2`, v.v.

## Frontend UI

Thêm panel Bản dựng/Timeline trong `StoryboardPage`, đặt gần khu vực preview/kết quả storyboard.

Panel hiển thị:

- Danh sách hoặc dropdown bản dựng của storyboard đang mở.
- Nút tạo bản dựng mới.
- Nút đổi tên và xoá bản dựng đang chọn.
- Tiêu đề timeline của bản dựng đang chọn và số lượng clip.
- Tổng thời lượng.
- Danh sách clip gồm thứ tự, label, filename, time range và duration.
- Nút lên/xuống để đổi thứ tự.
- Nút xoá clip.
- Nút `Đưa storyboard vào timeline`.
- Nút `Xuất clip rời (.zip)`.

Các match card hiện tại nên có thêm action `Thêm vào timeline`, bên cạnh preview và trim. Copy UI tiếp tục dùng tiếng Việt nhất quán với app.

State của danh sách bản dựng và timeline clip nên đặt gần state storyboard hiện tại trong `src/App.tsx`, trừ khi quá trình triển khai cần tách trước một hook nhỏ dành riêng cho storyboard. Tránh refactor không liên quan.

## Luồng Dữ Liệu

1. Người dùng mở một storyboard đã lưu.
2. Frontend gọi `/api/storyboards/{id}/timelines` để load danh sách bản dựng và clip.
3. Người dùng chọn một bản dựng hoặc tạo bản dựng mới.
4. Người dùng thêm match hoặc đưa toàn bộ storyboard vào bản dựng timeline.
5. Frontend cập nhật state local và persist clip bằng `PUT /api/storyboard-timelines/{timeline_id}/clips`.
6. Người dùng bấm export.
7. Backend đọc bản dựng timeline đã lưu, trim từng clip, zip các file MP4 và trả file ZIP để tải về.

## Xử Lý Lỗi

Hiển thị lỗi tiếng Việt cho các trường hợp:

- Storyboard chưa được lưu.
- Chưa có bản dựng timeline nào.
- Bản dựng timeline rỗng.
- Server không có ffmpeg.
- Không tìm thấy video nguồn.
- Export lỗi khi trim hoặc zip.

Trong lúc export, disable các control liên quan và hiển thị trạng thái loading. Nếu export lỗi, giữ nguyên timeline hiện tại.

## Kiểm Thử

Backend tests:

- CRUD bản dựng timeline cho một storyboard đã lưu.
- Một storyboard có thể có nhiều bản dựng timeline.
- Timeline của các storyboard khác nhau không lẫn nhau.
- Xoá storyboard thì xoá bản dựng timeline và clip đi kèm.
- Xoá bản dựng timeline thì xoá clip đi kèm.
- Export từ chối bản dựng timeline rỗng.
- Export validate khoảng thời gian không hợp lệ.

Frontend tests:

- Panel bản dựng timeline render cho storyboard đã lưu.
- Storyboard chưa lưu hiển thị thông báo cần lưu trước.
- Tạo và chọn nhiều bản dựng cho cùng một storyboard.
- `Đưa storyboard vào timeline` thêm match theo thứ tự beat.
- Reorder và remove cập nhật đúng thứ tự timeline.
- Nút export bị disable khi timeline rỗng và đang busy khi export.

Manual verification:

- Sau khi sửa frontend, chạy `npm run lint`.
- Sau khi sửa frontend, chạy `npm run build`.
- Nếu thêm backend tests, chạy các file pytest liên quan.

## Quyết Định Đã Chốt

Không còn quyết định sản phẩm mở cho phiên bản này. Hướng đã chọn là một storyboard đã lưu có thể có nhiều bản dựng timeline, mỗi bản dựng export thành nhiều clip rời trong một file ZIP.
