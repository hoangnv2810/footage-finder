# Thiết Kế Chuyển History Thành Thư Viện Dữ Liệu Và Sidebar Điều Hướng

## Mục tiêu

Điều chỉnh UI và framing nghiệp vụ của app để phản ánh luồng sử dụng mới:

- dữ liệu phân cảnh import từ extension là nguồn chính
- dữ liệu phân tích từ web vẫn được hỗ trợ và sẽ phát triển thêm sau
- cả hai nguồn phải hiển thị chung trong UI
- người dùng phải phân biệt được nguồn `Extension` và `Web`
- chế độ storyboard tiếp tục hoạt động trên các version/scenes đã lưu trong DB như hiện tại

Mục tiêu của vòng này là đổi đúng mental model của sản phẩm, không thay engine storyboard và không tạo hệ lưu trữ song song mới.

## Bối cảnh hiện tại

- Frontend là Vite + React, phần lớn logic đang nằm trong `src/App.tsx`.
- Backend là FastAPI trong `server/main.py`.
- SQLite hiện lưu dữ liệu theo trục `history -> history_video -> video_version -> search_result`.
- Luồng import từ extension đã đi qua `POST /api/import-analysis` và lưu scenes thành `video_version` trong DB.
- Luồng web hiện có `analyze` và `search`, đều ghi kết quả về DB.
- Storyboard hiện không làm trên raw video; nó nhận `selected_version_ids`, load scenes từ `video_version`, sinh beat từ script, rồi match beat với scenes đã lưu.

Điểm lệch lớn nhất ở thời điểm hiện tại là UI vẫn dùng framing `History/Lịch sử`, trong khi nghiệp vụ thực tế đã nghiêng sang mô hình dữ liệu tái sử dụng được, đặc biệt là dữ liệu import từ extension.

## Phạm vi vòng đầu

Bao gồm:

- đổi framing UI từ `Lịch sử` sang `Thư viện dữ liệu`
- chuyển layout chính sang sidebar điều hướng bên trái
- hiển thị chung dữ liệu từ `Extension` và `Web`
- thêm nhãn nguồn `Extension / Web`
- thêm filter theo nguồn trong `Thư viện dữ liệu`
- giữ nguyên logic storyboard hiện tại nhưng đổi cách chọn đầu vào cho khớp với mô hình mới
- thêm trường `source` vào dữ liệu video để frontend không phải đoán nguồn mãi bằng convention

Không bao gồm:

- viết lại toàn bộ domain backend thành `dataset` table riêng
- thay engine storyboard hoặc prompt storyboard
- thay đổi schema scene
- thêm bộ lọc nâng cao theo ngày, keyword, tên file ở vòng đầu
- thay đổi lớn logic trim/export video

## Hướng tiếp cận được chọn

Chọn hướng `giữ mô hình DB và API hiện tại ở phase đầu, nhưng chuyển domain hiển thị của UI sang Thư viện dữ liệu`.

### Vì sao chọn hướng này

- Phù hợp với nghiệp vụ mới mà không phải rewrite backend lớn.
- Reuse hoàn toàn flow import, search, version, storyboard đang chạy.
- Cho phép dùng chung dữ liệu `Extension` và `Web` ngay trong cùng một màn thư viện.
- Giảm rủi ro regression ở storyboard vì storyboard vẫn dựa trên `video_version` như hiện tại.

### Các hướng đã cân nhắc

1. Giữ DB/API hiện tại, đổi domain UI sang `Thư viện dữ liệu`, thêm `source`

- Đây là hướng được chọn.
- Scope nhỏ nhất mà vẫn đúng nghiệp vụ.

2. Tách backend sang domain `dataset` riêng hoàn toàn

- Sạch hơn về mặt mô hình lâu dài.
- Nhưng phải đổi DB, API, mapping UI, và migration lớn hơn mức cần thiết cho vòng đầu.

3. Chỉ gom dữ liệu ở frontend, không persist `source` ở backend

- Làm nhanh hơn trong ngắn hạn.
- Nhưng lệ thuộc vào suy luận kiểu `history_id startswith import:` và dễ sai hoặc khó mở rộng về sau.

## Kiến trúc UI mới

Ứng dụng chuyển từ mô hình `một màn hình lớn + panel lịch sử` sang `ứng dụng có điều hướng chính bằng sidebar bên trái`.

### Sidebar trái

Menu chính gồm:

1. `Thư viện dữ liệu`
2. `Tìm phân cảnh`
3. `Storyboard`

Sidebar là điều hướng cấp 1 của app và luôn hiện. Nội dung bên phải thay đổi theo menu đang chọn.

### 1. Thư viện dữ liệu

Đây là màn trung tâm mới của app.

Trách nhiệm:

- hiển thị toàn bộ dataset/video đã có trong DB
- phân biệt nguồn `Extension` và `Web`
- lọc theo nguồn
- cho phép mở chi tiết từng dataset để xem version và scenes
- là nơi quay về để thấy trạng thái dữ liệu thật đã lưu trong DB

Mỗi dataset item hiển thị tối thiểu:

- `datasetId` (nội bộ, dùng `dbVideoId`)
- `fileName`
- nhãn nguồn `Extension` hoặc `Web`
- `status`
- số version
- thời gian cập nhật gần nhất

Khi mở một dataset, UI hiển thị:

- danh sách version
- version đang chọn
- scenes của version đó
- kết quả search đã lưu nếu có

### 2. Tìm phân cảnh

Màn này là nơi thao tác theo từ khóa.

Trách nhiệm:

- chạy phân tích web khi cần
- search trên version đã có
- ghi kết quả quay lại DB
- sau khi lưu xong, dữ liệu xuất hiện trong `Thư viện dữ liệu`

Điểm quan trọng là kết quả tạo ra ở đây không còn được đóng khung là một “history item” riêng trong UI. Nó là dữ liệu mới hoặc dữ liệu cập nhật trong thư viện.

### 3. Storyboard

Màn này giữ logic cốt lõi hiện tại.

Trách nhiệm:

- nhận script và thông tin sản phẩm
- chọn một hoặc nhiều `video_version` từ dữ liệu đã có trong DB
- sinh beat
- match beat với scenes đã lưu
- preview kết quả

Nguồn đầu vào cho storyboard có thể đến từ cả `Extension` lẫn `Web`, miễn version có scenes hợp lệ.

## Mô hình dữ liệu hiển thị

Ở tầng UI, đơn vị hiển thị chính nên là `1 video dataset`, không phải `1 history batch`.

Lý do:

- dữ liệu import từ extension bản chất gắn với từng video
- storyboard chọn theo `video_version`
- gắn nhãn `Extension / Web` ở cấp video là đúng nghiệp vụ hơn cấp batch

Shape hiển thị tối thiểu của một dataset item:

- `datasetId`
- `historyId`
- `fileName`
- `source: extension | web`
- `status`
- `versions`
- `currentVersionIndex`
- `currentSearchKeywords`
- `searchResults`
- `updatedAt`

`datasetId` nên dùng `dbVideoId` hiện có trong payload backend để tránh va chạm khi cùng một `fileName` xuất hiện ở nhiều history item hoặc nhiều lần phân tích web khác nhau.

`source` là metadata nghiệp vụ mới, dùng để:

- hiển thị badge nguồn
- filter trong `Thư viện dữ liệu`
- giúp storyboard và các màn khác giải thích dữ liệu đang đến từ đâu

## Điều chỉnh backend và DB

### DB

Phase đầu nên thêm cột `source` vào `history_video`.

Giá trị hợp lệ:

- `extension`
- `web`

Lý do chọn `history_video`:

- gần với đơn vị hiển thị mới là video dataset
- không cần tạo bảng mới
- không làm thay đổi cơ chế lưu `video_version` và `search_result`

### Migration dữ liệu cũ

Dữ liệu đã có được suy ra như sau:

- `history_id` bắt đầu bằng `import:` -> `extension`
- còn lại -> `web`

Đây là rule migration một lần. Sau đó nguồn phải được persist trực tiếp trong DB thay vì tiếp tục suy luận ở frontend.

### API

Phase đầu có thể giữ các route hiện tại:

- `GET /api/history`
- `POST /api/history/selection`
- `POST /api/analyze`
- `POST /api/search`
- `POST /api/storyboard/generate`
- `POST /api/import-analysis`

Nhưng payload trả về cho mỗi video cần bổ sung `source`.

Việc giữ route cũ giúp giới hạn scope backend, còn frontend sẽ đổi cách gọi tên và cách render domain.

## Luồng dữ liệu và điều hướng

### Luồng A: Import từ extension

1. Extension gửi scenes vào `POST /api/import-analysis`
2. Backend validate payload và lưu thành `video_version`
3. Dataset tương ứng được đánh dấu `source=extension`
4. `Thư viện dữ liệu` hiển thị dataset đó với nhãn `Extension`
5. User có thể mở version/scenes và dùng ngay cho storyboard

### Luồng B: Phân tích từ web

1. User vào `Tìm phân cảnh`
2. User upload/chọn video và chạy analyze hoặc search
3. Backend lưu kết quả như hiện tại
4. Dataset tương ứng được đánh dấu `source=web`
5. `Thư viện dữ liệu` hiển thị hoặc cập nhật dataset đó với nhãn `Web`

### Luồng C: Storyboard

1. User vào `Storyboard`
2. User chọn một hoặc nhiều version từ các dataset trong DB
3. User nhập script và thông tin sản phẩm
4. Backend chạy flow storyboard hiện tại
5. UI hiển thị beats, matches, preview như hiện nay

## Context đang chọn trong UI

Để điều hướng sidebar không bị rời rạc, app cần khái niệm context hiện tại:

- `activeMenu`
- `activeDataset`
- tùy chọn `activeVersion`

`activeDataset` phải trỏ tới định danh dataset nội bộ, không chỉ `fileName`.

Quy tắc:

- khi user chọn dataset trong `Thư viện dữ liệu`, đó trở thành context mặc định cho các màn khác
- `Tìm phân cảnh` có thể dùng dataset này làm mặc định nhưng vẫn cho upload/chọn mới
- `Storyboard` có thể bắt đầu từ dataset đang active nhưng không bị khóa, vì vẫn phải hỗ trợ chọn nhiều version từ nhiều dataset

Mục tiêu là giữ trải nghiệm liền mạch mà không đánh mất khả năng chọn linh hoạt cho storyboard.

## Tác động đến storyboard

Storyboard giữ nguyên engine hiện tại.

Không thay đổi:

- request shape cơ bản của `/api/storyboard/generate`
- cơ chế load `selected_version_ids`
- cơ chế sinh beat từ script
- cơ chế match beat với scenes đã lưu
- preview theo `scene.start` và `scene.end`

Thay đổi ở vòng này chỉ là:

- cách user đi tới màn storyboard
- cách user chọn nguồn đầu vào
- cách UI giải thích nguồn dữ liệu `Extension / Web`

Điều này đảm bảo dữ liệu import từ extension và dữ liệu web đều được dùng như nhau ở storyboard miễn là version hợp lệ.

## Error handling và edge cases

### 1. Import trùng dữ liệu

Luồng import hiện đã có check duplicate theo latest version nếu scenes giống hệt. UI không nên tạo item mới giả trong thư viện cho trường hợp này. Thay vào đó chỉ refresh đúng dataset hiện có.

### 2. Dataset chưa usable cho storyboard

Nếu dataset có record nhưng chưa có version hợp lệ hoặc scenes rỗng:

- vẫn hiện trong `Thư viện dữ liệu`
- nhưng không cho chọn trong `Storyboard`

### 3. Dataset lỗi từ web

Nếu analyze/search lỗi:

- dataset vẫn có thể hiện với `status=error`
- `Thư viện dữ liệu` cần hiển thị rõ trạng thái lỗi
- `Storyboard` không cho dùng version lỗi hoặc không hợp lệ

### 4. Filter theo nguồn

Khi chọn filter `Extension` hoặc `Web` mà không có dữ liệu:

- hiển thị empty state đúng theo filter
- không dùng copy cũ kiểu `Chưa có lịch sử`

### 5. Chuyển màn khi đang có context không hợp lệ

Nếu user chuyển sang `Storyboard` với dataset đang active nhưng dataset đó không có version usable:

- giữ context
- hiển thị thông báo rõ là chưa có dữ liệu dùng cho storyboard
- không tự động chuyển sang dataset khác

### 6. Xóa dữ liệu

Nếu vẫn giữ hành động xóa ở UI, wording phải phản ánh đúng là xóa dữ liệu đã lưu hoặc xóa dataset, không phải xóa “lịch sử tìm kiếm”.

## Copy và ngôn ngữ UI

Các chỗ dùng framing cũ cần đổi để phản ánh nghiệp vụ mới:

- `Lịch sử` -> `Thư viện dữ liệu`
- `Chưa có lịch sử` -> empty state theo ngữ cảnh thư viện
- `Phân tích mới` hoặc `Tìm kiếm mới` -> wording mới theo menu hoặc thao tác thật sự

User-facing copy tiếp tục giữ tiếng Việt để nhất quán với app hiện tại.

## Verification và tiêu chí hoàn thành

### Verification tối thiểu

1. `npm run lint`
2. `npm run build`

### Kiểm thử thủ công bắt buộc

1. Sidebar trái hiển thị đúng 3 menu:
   - `Thư viện dữ liệu`
   - `Tìm phân cảnh`
   - `Storyboard`
2. `Thư viện dữ liệu` hiển thị được dữ liệu đã có trong DB
3. Dataset import từ extension có nhãn `Extension`
4. Dataset tạo từ web có nhãn `Web`
5. Filter theo nguồn hoạt động đúng
6. Mở dataset xem được version/scenes
7. Chạy luồng web xong, dữ liệu quay về xuất hiện đúng trong `Thư viện dữ liệu`
8. `Storyboard` chọn được version từ cả `Extension` lẫn `Web`
9. Sinh storyboard thành công và preview match vẫn hoạt động

### Regression quan trọng

- không làm hỏng `POST /api/import-analysis`
- không làm hỏng `POST /api/storyboard/generate`
- không làm mất khả năng search theo `version_id`
- không làm sai `currentVersionIndex` và version đang chọn của dữ liệu hiện có

### Definition of done

- UI không còn dùng `History/Lịch sử` làm navigation chính
- `Thư viện dữ liệu` trở thành nơi hiển thị chung cho dữ liệu `Extension` và `Web`
- người dùng phân biệt và lọc được theo nguồn
- storyboard tiếp tục dùng chung được cả hai nguồn mà không đổi engine cốt lõi
- mental model của app chuyển từ “xem lịch sử thao tác” sang “xem và dùng dữ liệu đã lưu”

## Gợi ý triển khai theo phase

### Phase 1: đổi framing và dữ liệu nguồn

- thêm `source` ở DB và payload API
- đổi wording UI từ history sang thư viện dữ liệu
- thêm badge nguồn và filter theo nguồn

### Phase 2: đổi layout sang sidebar menu trái

- tách navigation cấp 1 thành `Thư viện dữ liệu / Tìm phân cảnh / Storyboard`
- tách logic render khỏi một màn hình duy nhất

### Phase 3: làm mượt context giữa các màn

- thêm `activeMenu`
- thêm `activeDataset`
- dùng dataset đang chọn làm context mặc định khi chuyển màn

Thứ tự này giữ scope nhỏ, giúp kiểm soát regression, và cho phép ship thay đổi theo từng bước có thể kiểm thử được.
