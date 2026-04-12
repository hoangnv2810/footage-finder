# Kế Hoạch Triển Khai Thư Viện Dữ Liệu Và Sidebar Điều Hướng

## Mục tiêu triển khai

Triển khai thay đổi UI và dữ liệu theo spec `2026-04-12-dataset-library-sidebar-design.md` mà không làm hỏng các flow hiện có:

- import từ extension
- analyze/search từ web
- storyboard từ `selected_version_ids`
- trim/export theo scene

Phương án triển khai ưu tiên thay đổi nhỏ, theo phase, và giữ nguyên contract quan trọng của storyboard.

## Nguyên tắc thực hiện

- Không đổi engine storyboard.
- Không đổi schema scene.
- Giữ các route backend hiện tại ở phase đầu.
- Dataset trong UI dùng `dbVideoId` làm identity, không dùng riêng `fileName`.
- Chỉ đổi copy và mental model ở tầng UI; backend có thể còn tên `history` trong route/payload nội bộ giai đoạn đầu.

## Phase 1: Bổ sung nguồn dữ liệu ở backend

### Mục tiêu

Persist được nguồn `extension | web` trong DB và trả nó ra API để frontend không còn phải đoán nguồn bằng convention.

### File chính

- `server/db.py`

### Công việc

1. Thêm cột `source` vào bảng `history_video` trong `init_db()`.
2. Nếu cột chưa tồn tại, chạy migration:
   - thêm cột mới
   - backfill `extension` cho record có `history_id` bắt đầu bằng `import:`
   - backfill `web` cho phần còn lại
3. Cập nhật `_video_row_to_dict()` để trả thêm `source`.
4. Cập nhật các hàm ghi dữ liệu để set `source` đúng:
   - `save_analysis()` -> `web`
   - `save_import_analysis()` -> `extension`
   - `save_analysis_error()` -> `web`
   - `save_history()` nếu còn dùng cho restore/save tổng quát thì phải preserve `source` nếu payload có truyền lên
5. Giữ `dbVideoId` trong payload vì frontend sẽ dùng làm `datasetId`.

### Kết quả mong đợi

- `GET /api/history` trả mỗi video kèm `source`
- dữ liệu cũ được gắn nguồn chính xác khi mở app lần đầu sau migration

## Phase 2: Tạo lớp dữ liệu `dataset library` ở frontend

### Mục tiêu

Tách domain hiển thị khỏi framing `history batch`, nhưng vẫn dùng dữ liệu lấy từ `/api/history`.

### File chính

- `src/App.tsx`

### Công việc

1. Thêm type frontend cho `DatasetItem` hoặc đổi tên type hiện có theo hướng rõ nghiệp vụ hơn.
2. Viết hàm selector/mapper flatten từ `HistoryItem[]` sang `DatasetItem[]`.
3. Dataset item tối thiểu cần có:
   - `datasetId` từ `dbVideoId`
   - `historyId`
   - `fileName`
   - `source`
   - `status`
   - `versions`
   - `currentVersionIndex`
   - `currentSearchKeywords`
   - `searchResults`
   - `updatedAt` từ `history.date`
4. Không merge theo `fileName` vì một file có thể tồn tại ở nhiều `history_video` khác nhau.
5. Thêm state filter nguồn:
   - `all`
   - `extension`
   - `web`
6. Thêm selector để trả ra danh sách dataset đã lọc theo nguồn.

### Kết quả mong đợi

- frontend có thể render thư viện theo đơn vị dataset độc lập với cấu trúc batch cũ
- dataset `Extension` và `Web` cùng tồn tại trong một danh sách

## Phase 3: Tách navigation thành sidebar trái

### Mục tiêu

Đổi shell của app từ `sidebar lịch sử + main view` sang `sidebar điều hướng + workspace`.

### File chính

- `src/App.tsx`

### Công việc

1. Thay state `isSidebarOpen` hiện tại bằng navigation state rõ nghĩa hơn:
   - `activeMenu: 'library' | 'search' | 'storyboard'`
2. Tách sidebar cũ thành sidebar điều hướng cố định.
3. Render 3 menu:
   - `Thư viện dữ liệu`
   - `Tìm phân cảnh`
   - `Storyboard`
4. Bỏ icon/copy gợi `History/Lịch sử` khỏi navigation chính.
5. Giữ layout responsive đơn giản:
   - desktop: sidebar trái cố định
   - mobile: có thể collapse nhưng vẫn là navigation, không quay lại mô hình history panel

### Kết quả mong đợi

- user nhìn app như một công cụ nhiều chức năng dùng chung dữ liệu, không còn như một màn search có lịch sử phụ

## Phase 4: Dựng màn `Thư viện dữ liệu`

### Mục tiêu

Biến khu vực history cũ thành `Thư viện dữ liệu` thực sự.

### File chính

- `src/App.tsx`

### Công việc

1. Đổi copy:
   - `Lịch sử` -> `Thư viện dữ liệu`
   - `Chưa có lịch sử` -> empty state theo thư viện
2. Render danh sách dataset đã flatten thay vì render trực tiếp `history` batch.
3. Mỗi item hiển thị:
   - tên file
   - badge nguồn `Extension` hoặc `Web`
   - status
   - số version
   - thời gian cập nhật
4. Thêm filter nguồn ở đầu danh sách.
5. Khi click item:
   - set `activeDatasetId`
   - mở panel chi tiết dataset ở vùng phải hoặc phần detail trong workspace
6. Detail của dataset hiển thị:
   - danh sách version
   - version đang chọn
   - scene list của version đang chọn
   - kết quả search đã lưu nếu có
7. Đổi wording nút xóa để phản ánh xóa dữ liệu đã lưu, không phải xóa lịch sử tìm kiếm.

### Kết quả mong đợi

- `Thư viện dữ liệu` là nơi xem dữ liệu đã lưu trong DB, bất kể nguồn nào

## Phase 5: Điều chỉnh màn `Tìm phân cảnh`

### Mục tiêu

Giữ nguyên flow analyze/search nhưng biến nó thành màn thao tác trên dữ liệu, không phải trung tâm của app.

### File chính

- `src/App.tsx`

### Công việc

1. Giữ lại form từ khóa, upload, analyze, search đang có.
2. Tách phần render của search mode thành workspace riêng dưới `activeMenu === 'search'`.
3. Khi có `activeDatasetId`, dùng dataset đó làm context mặc định nếu phù hợp.
4. Sau khi analyze/search xong:
   - refresh data từ backend
   - đồng bộ lại `DatasetItem[]`
   - nếu có thể, đưa focus về dataset vừa cập nhật
5. Bỏ copy kiểu `Phân tích mới` nếu nó còn mang nghĩa reset history batch; đổi thành hành động rõ hơn theo màn.

### Kết quả mong đợi

- web analyze/search vẫn chạy như cũ
- kết quả quay lại `Thư viện dữ liệu` thay vì tạo cảm giác là một khối lịch sử tách biệt

## Phase 6: Điều chỉnh màn `Storyboard`

### Mục tiêu

Giữ engine storyboard nhưng đổi nguồn chọn đầu vào cho khớp với mô hình dataset.

### File chính

- `src/App.tsx`

### Công việc

1. Tách phần render storyboard thành workspace riêng dưới `activeMenu === 'storyboard'`.
2. Nguồn lựa chọn storyboard phải lấy từ dataset/version đã flatten từ backend, không phụ thuộc vào một batch history đang mở.
3. Khi build danh sách selectable source:
   - dùng `datasetId`
   - lấy version đang chọn hoặc danh sách version khả dụng theo nhu cầu UI
   - hiển thị badge `Extension` hoặc `Web`
4. Chỉ cho chọn source có version/scenes hợp lệ.
5. Giữ nguyên payload gửi lên `/api/storyboard/generate`:
   - `product_name`
   - `category`
   - `target_audience`
   - `tone`
   - `key_benefits`
   - `script_text`
   - `selected_version_ids`
6. Giữ nguyên behavior preview match theo `scene.start/end`.

### Kết quả mong đợi

- storyboard dùng chung được dữ liệu `Extension` và `Web`
- không cần chỉnh backend storyboard ngoài phần hiển thị nguồn ở UI nếu muốn

## Phase 7: Context và điều hướng liên màn

### Mục tiêu

Làm cho 3 màn dùng chung ngữ cảnh dataset mà không khóa user vào một luồng cứng.

### File chính

- `src/App.tsx`

### Công việc

1. Thêm state:
   - `activeDatasetId`
   - tùy chọn `activeVersionId`
2. Khi chọn dataset ở `Thư viện dữ liệu`, lưu context này.
3. Khi chuyển sang `Tìm phân cảnh`, nếu dataset active phù hợp thì preselect nó.
4. Khi chuyển sang `Storyboard`, dùng dataset active làm context gợi ý ban đầu nhưng vẫn cho chọn nhiều source khác.
5. Nếu dataset active không usable cho storyboard:
   - giữ selection
   - hiện empty/error state rõ ràng
   - không tự chọn dataset khác

### Kết quả mong đợi

- điều hướng liền mạch
- không gây nhầm giữa “màn đang mở” và “dữ liệu đang thao tác”

## Phase 8: Copy, trạng thái rỗng, và lỗi

### Mục tiêu

Xóa hoàn toàn framing `history` ở các điểm user nhìn thấy và làm rõ trạng thái dữ liệu.

### File chính

- `src/App.tsx`

### Công việc

1. Rà toàn bộ copy user-facing liên quan tới:
   - `Lịch sử`
   - `Chưa có lịch sử`
   - `Tìm kiếm mới`
   - `Phân tích mới`
2. Đổi sang copy bám theo menu và context mới.
3. Thêm empty state riêng cho:
   - thư viện trống hoàn toàn
   - filter không có kết quả
   - storyboard chưa có source usable
4. Hiển thị rõ status `error` cho dataset web lỗi.
5. Nếu import trùng không tạo version mới, UI chỉ refresh item hiện có thay vì tạo bản ghi giả mới.

### Kết quả mong đợi

- UI nhất quán với nghiệp vụ mới
- user hiểu đâu là dữ liệu đã lưu, đâu là thao tác tạo thêm dữ liệu

## Verification

### Tự động

1. `npm run lint`
2. `npm run build`

### Thủ công

1. Mở app và thấy sidebar trái có 3 menu đúng tên.
2. `Thư viện dữ liệu` render được dataset từ DB.
3. Dataset import hiển thị badge `Extension`.
4. Dataset từ analyze web hiển thị badge `Web`.
5. Filter nguồn hoạt động đúng.
6. Chọn dataset xem được version/scenes.
7. Chạy analyze/search từ web xong, dataset tương ứng được refresh trong thư viện.
8. Storyboard chọn được version từ cả hai nguồn.
9. Tạo storyboard xong, preview match vẫn hoạt động.

### Regression cần chú ý

- không làm hỏng `POST /api/import-analysis`
- không làm hỏng `POST /api/storyboard/generate`
- không làm sai `currentVersionIndex`
- không làm mất search theo `version_id`

## Thứ tự thực hiện đề xuất

1. Backend `source` migration và API payload
2. Frontend flatten `HistoryItem[] -> DatasetItem[]`
3. Sidebar navigation shell
4. `Thư viện dữ liệu`
5. `Tìm phân cảnh`
6. `Storyboard`
7. Copy, empty state, error state
8. Verification cuối

Thứ tự này giúp mỗi phase đều có kết quả kiểm thử được, đồng thời giảm nguy cơ đụng nhầm engine storyboard hoặc import flow hiện có.
