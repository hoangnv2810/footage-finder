# Thiết Kế Quản Lý Video Một Thư Mục Và Rename File Thật

## Trạng thái

Spec này thay thế phần thiết kế `folder management` trong `docs/superpowers/specs/2026-04-19-product-folder-video-rename-design.md`.

Điểm thay đổi cốt lõi:

- từ mô hình `một video thuộc nhiều thư mục`
- sang mô hình `một video chỉ thuộc đúng một thư mục`

Việc rename file vật lý vẫn được giữ nguyên là yêu cầu bắt buộc.

## Mục tiêu

Đơn giản hóa `Thư viện dữ liệu` để người dùng quản lý thư mục và video theo mental model rõ ràng hơn:

- mỗi video chỉ thuộc đúng một thư mục logic trong app
- thư mục có menu `3 chấm` chỉ để `Sửa tên` và `Xóa`
- video có action `Sửa` riêng ngay tại item video
- popup `Sửa video` cho phép:
  - đổi tên file video thật
  - chuyển video sang thư mục khác
- xóa thư mục sẽ tự động chuyển toàn bộ video trong thư mục đó về `Chưa phân loại`
- `Chưa phân loại` là thư mục hệ thống, không được sửa tên và không được xóa
- giữ nguyên toàn bộ history/version/search/storyboard khi rename file hoặc chuyển thư mục

## Bối cảnh hiện tại

- Backend và frontend đang dở theo hướng `multi-folder`.
- `video_file.primary_product_folder_id` đã tồn tại và đã đủ để làm nguồn sự thật cho bài toán `mỗi video thuộc một thư mục`.
- Trong code hiện tại vẫn còn các khái niệm cũ như `linkedFolders`, `product_folder_video`, `set primary`, `gắn thêm folder`, `gỡ folder`.
- Các khái niệm này làm UI và nghiệp vụ phức tạp hơn nhu cầu hiện tại.

Vấn đề của hướng cũ:

- user thấy khó hiểu vì cùng một video có nhiều action liên quan nhiều folder
- UI phát sinh thao tác dễ nhầm như `xóa thư mục` và `gỡ liên kết`
- code backend/frontend phải giữ nhiều trạng thái không còn cần thiết

## Phạm vi vòng này

Bao gồm:

- chuẩn hóa rule `1 video = 1 thư mục`
- đổi thiết kế UI sidebar theo rule mới
- thêm menu `3 chấm` ở item thư mục cho `Sửa tên` và `Xóa`
- thêm action `Sửa` ở item video
- popup `Sửa video` hỗ trợ `đổi tên file` và `chuyển thư mục`
- popup xác nhận `Xóa thư mục`
- chặn sửa/xóa `Chưa phân loại`
- migration dữ liệu từ trạng thái `multi-folder` hiện có sang `single-folder`
- giữ an toàn dữ liệu phân tích khi rename file thật

Không bao gồm:

- nhiều thư mục cho một video
- gắn/gỡ folder thủ công cho cùng một video
- chọn folder thay thế khi xóa thư mục
- bulk move/bulk rename
- thay đổi schema scene, storyboard engine, search engine

## Hướng tiếp cận được chọn

Chọn hướng `single folder per video` với nguyên tắc:

- `video_file.id` là identity của video vật lý
- `history_video.id` là identity của dataset phân tích
- `video_file.primary_product_folder_id` là nguồn sự thật duy nhất cho folder hiện tại của video
- frontend và API chỉ hiển thị một `folder` duy nhất cho mỗi video

### Vì sao chọn hướng này

- khớp đúng yêu cầu mới của user
- loại bỏ toàn bộ mental model `primary + linked folders`
- sidebar dễ hiểu hơn: mỗi video xuất hiện đúng một lần
- popup `Sửa video` có thể gom đúng hai nghiệp vụ của video: rename file và chuyển thư mục
- backend đơn giản hơn vì không còn link/unlink/set-primary

## Các hướng đã cân nhắc

1. `Tách theo đối tượng`

- Đây là hướng được chọn.
- Folder có menu `3 chấm` riêng.
- Video có action `Sửa` riêng.
- Rõ trách nhiệm nhất giữa thao tác thư mục và thao tác video.

2. `Dồn hết về menu 3 chấm`

- Đồng nhất bề mặt UI hơn.
- Nhưng thao tác sửa video bị sâu thêm một bước và kém trực diện.

3. `Dồn hết sang detail panel`

- Sidebar sạch hơn.
- Nhưng trái với yêu cầu mới là chỉnh video ngay tại item video và chỉnh folder ngay tại item thư mục.

## Mô hình domain

### 1. Video vật lý

- bảng chính: `video_file`
- identity: `video_file.id`
- thuộc tính liên quan trong vòng này:
  - `filename`
  - `size_bytes`
  - `modified_at`
  - `primary_product_folder_id`

### 2. Dataset phân tích

- bảng chính: `history_video`
- identity: `history_video.id`
- vẫn giữ quan hệ với `history`, `video_version`, `search_result`
- tham chiếu tới `video_file.id`

### 3. Thư mục sản phẩm

- bảng chính: `product_folder`
- mỗi video chỉ thuộc một thư mục thông qua `video_file.primary_product_folder_id`
- `Chưa phân loại` là thư mục hệ thống duy nhất

### Rule nghiệp vụ bắt buộc

- mỗi `video_file` chỉ có đúng một folder hợp lệ tại mọi thời điểm
- `Chưa phân loại` không được rename
- `Chưa phân loại` không được delete
- xóa thư mục thường không xóa video, chỉ chuyển video về `Chưa phân loại`
- chuyển thư mục là thao tác trên video, không phải thao tác gắn/gỡ nhiều folder

## Quy tắc migration từ dữ liệu đang làm dở

Vì code hiện tại đang có dấu vết `multi-folder`, migration vòng này phải chuẩn hóa về `single-folder`.

### Rule migrate

- nếu một video đang có nhiều folder cũ:
  - giữ `primary folder`
  - bỏ các linked folder còn lại
- nếu `primary folder` không hợp lệ hoặc không tồn tại:
  - chuyển video về `Chưa phân loại`
- sau migration, payload public không được còn lộ `linkedFolders`

### Ghi chú triển khai

- có thể giữ `product_folder_video` tạm thời ở mức migration/legacy nếu cần để đọc dữ liệu cũ
- nhưng sau migration, runtime behavior và public API không được phụ thuộc vào bảng này nữa
- nguồn sự thật duy nhất phải là `video_file.primary_product_folder_id`

## Mapping dữ liệu trả về frontend

Payload video nên tối giản về đúng domain mới:

```ts
{
  dbVideoId: number;
  videoFileId: number;
  fileName: string;
  source: 'extension' | 'web';
  folder: { id: number; name: string; isSystem: boolean };
  status: 'pending' | 'success' | 'error';
  versions: VideoVersion[];
  currentVersionIndex: number;
  currentSearchKeywords: string;
}
```

Mapping rule:

- bỏ `primaryFolder`
- bỏ `linkedFolders`
- bỏ `linkedFolderCount`
- `folder` là field duy nhất frontend dùng để group Library

## Thiết kế UI

## Library Sidebar

Sidebar tiếp tục là cây điều hướng chính, nhưng theo rule đơn giản:

- `folder > video`
- mỗi video chỉ hiện đúng một lần

### 1. Item thư mục

Mỗi folder row hiển thị:

- tên thư mục
- số video trong thư mục
- nút `3 chấm`

Menu `3 chấm` của folder thường:

- `Sửa tên`
- `Xóa`

Menu `3 chấm` của `Chưa phân loại`:

- không cho `Sửa tên`
- không cho `Xóa`
- vẫn hiển thị nút `3 chấm`, nhưng menu chỉ có trạng thái read-only với label giải thích đây là thư mục hệ thống

### 2. Popup `Sửa tên thư mục`

Popup nhỏ gồm:

- input tên thư mục
- nút `Hủy`
- nút `Lưu`

Validate:

- không rỗng
- không trùng tên
- không cho sửa `Chưa phân loại`

### 3. Popup `Xóa thư mục`

Popup xác nhận gồm:

- tên thư mục sắp xóa
- cảnh báo rõ rằng toàn bộ video trong thư mục này sẽ chuyển về `Chưa phân loại`
- nút `Hủy`
- nút `Xóa thư mục`

Popup này không có chọn thư mục thay thế.

### 4. Item video

Mỗi video row hiển thị:

- tên file video thật
- badge nguồn/trạng thái như hiện tại
- icon `Sửa`

Click `Sửa` mở popup `Sửa video` ngay theo video đó.

### 5. Popup `Sửa video`

Popup `Sửa video` là popup duy nhất cho nghiệp vụ video ở sidebar.

Bao gồm hai phần:

1. `Đổi tên video`

- input tên file mới
- mô tả rõ đây là rename file vật lý trong thư viện

2. `Chuyển thư mục`

- select thư mục đích
- không cho chọn lại đúng thư mục hiện tại

Footer:

- `Hủy`
- `Lưu thay đổi`

Rule save:

- có thể chỉ đổi tên file
- có thể chỉ chuyển thư mục
- có thể làm đồng thời cả hai trong một lần save
- save thành công phải giữ selected video nếu dataset còn tồn tại

## Detail Panel

Detail panel bên phải không còn là nơi chứa các action `multi-folder`.

Giữ lại:

- playback
- versions
- search
- trim
- storyboard
- metadata file name và folder hiện tại ở dạng read-only

Không còn giữ các action:

- add folder
- remove linked folder
- set primary folder

## Thiết kế API

## Folder APIs

- `GET /api/product-folders`
  - trả danh sách folder và số video trong mỗi folder
- `POST /api/product-folders`
  - tạo folder mới
- `PATCH /api/product-folders/{folder_id}`
  - đổi tên folder
- `DELETE /api/product-folders/{folder_id}`
  - xóa folder và tự động chuyển toàn bộ video trong folder về `Chưa phân loại`

Rule:

- delete `Chưa phân loại` phải bị chặn ở backend
- rename `Chưa phân loại` phải bị chặn ở backend

## Video API

Để khớp UX `một popup, một nút lưu`, dùng một endpoint patch duy nhất cho video:

- `PATCH /api/video-files/{video_file_id}`

Request body:

```json
{
  "filename": "ten-moi.mp4",
  "folder_id": 12
}
```

Rule:

- nếu chỉ có `filename` thì chỉ rename file vật lý
- nếu chỉ có `folder_id` thì chỉ move video sang folder mới
- nếu có cả hai thì xử lý trong một transaction logic duy nhất
- frontend disable nút `Lưu thay đổi` nếu không có thay đổi thực tế
- backend vẫn chấp nhận patch cùng giá trị hiện tại như một no-op thành công để tránh lệ thuộc tuyệt đối vào UI

### Atomicity

`PATCH /api/video-files/{id}` phải có hành vi atomic ở mức nghiệp vụ:

- validate toàn bộ input trước
- nếu rename file thật thành công nhưng cập nhật DB fail thì phải rollback tên file về tên cũ
- không được để trạng thái `file system` và `database` lệch nhau sau request lỗi

## Tác động lên code hiện tại

### Backend

- loại bỏ runtime logic `link folder`, `unlink folder`, `set primary folder`
- các route sau không còn là public API đích:
  - `/api/video-files/{id}/folders`
  - `/api/video-files/{id}/folders/{folder_id}`
  - `/api/video-files/{id}/primary-folder`
- serializer không còn trả `linkedFolders`
- serializer không còn trả `primaryFolder`; thay bằng `folder`

### Frontend

- bỏ block `VideoAssetManager` theo hướng multi-folder khỏi detail panel hiện tại
- thay bằng popup hoặc component mới chỉ phục vụ `Sửa video`
- bỏ linked-folder badge
- bỏ action add/remove/set-primary
- sidebar item folder và item video trở thành entry point chính cho mutate actions

## Error Handling

### Folder

- tên trống -> `400`
- tên trùng -> `400`
- folder không tồn tại -> `404`
- rename/delete `Chưa phân loại` -> `400`

### Video patch

- filename không hợp lệ -> `400`
- filename trùng file khác -> `400`
- folder không tồn tại -> `404`
- video không tồn tại -> `404`
- patch trùng dữ liệu hiện tại -> backend trả thành công dạng no-op

Error message nên rõ và ngắn, đủ để hiện trực tiếp trong popup.

## Test Plan

### Backend

- migrate dữ liệu cũ `multi-folder` sang `single-folder`
- chỉ giữ `primary folder` khi video có nhiều folder cũ
- video không có folder hợp lệ sẽ về `Chưa phân loại`
- rename folder thường thành công
- rename/delete `Chưa phân loại` bị chặn
- delete folder thường sẽ move toàn bộ video về `Chưa phân loại`
- `PATCH /api/video-files/{id}`:
  - chỉ rename file
  - chỉ move folder
  - rename + move cùng lúc
  - filename conflict
  - folder không tồn tại
  - rollback đúng nếu update DB lỗi sau khi rename file thật
- rename file vẫn giữ history/version/search/storyboard usability

### Frontend

- folder row có menu `3 chấm`
- `Chưa phân loại` không có action mutate thực tế
- popup `Sửa tên thư mục`
- popup xác nhận `Xóa thư mục`
- video row có icon `Sửa`
- popup `Sửa video` hỗ trợ:
  - chỉ rename
  - chỉ move folder
  - rename + move cùng lúc
- save xong vẫn giữ selected video hợp lệ

## Ngoài phạm vi

- hỗ trợ một video thuộc nhiều thư mục
- bulk operations
- chọn folder thay thế khi xóa
- chỉnh folder từ detail panel
- backward compatibility cho payload cũ lâu dài

## Kết luận

Thiết kế vòng này chủ đích rút bài toán về mental model đơn giản nhất:

- folder quản lý folder
- video quản lý video
- mỗi video chỉ ở một thư mục
- `Chưa phân loại` là điểm rơi an toàn cho mọi trường hợp xóa thư mục

Thiết kế này cho phép đơn giản hóa đáng kể cả UI lẫn backend, đồng thời vẫn giữ nguyên yêu cầu khó nhất: rename file vật lý mà không làm gãy dữ liệu phân tích đã lưu.
