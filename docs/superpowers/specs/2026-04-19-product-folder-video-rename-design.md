# Thiết Kế Thư Mục Sản Phẩm Logic Và Rename File Video Thật

## Mục tiêu

Mở rộng `Thư viện dữ liệu` để hỗ trợ quản lý video theo mô hình thư mục sản phẩm logic trong app, đồng thời cho phép đổi `filename` thật của video mà không làm mất dữ liệu phân tích đã lưu.

Mục tiêu cụ thể:

- thêm thực thể `thư mục sản phẩm` ở mức domain rõ ràng, thay cho việc chỉ group tạm theo `productName`
- cho phép một video thuộc nhiều thư mục sản phẩm
- vẫn có một `thư mục chính` để app group, điều hướng, và truyền ngữ cảnh nhất quán
- cho phép đổi `filename` thật của video trong `VIDEO_FOLDER`
- giữ nguyên toàn bộ `history`, `video_version`, `search_result`, trim, stream, storyboard khi rename
- không biến rename thành tạo dataset mới

## Bối cảnh hiện tại

- Frontend là Vite + React, phần lớn state và data mapping vẫn tập trung ở `src/App.tsx`.
- Backend là FastAPI trong `server/main.py`.
- SQLite hiện lưu dữ liệu theo trục `history -> history_video -> video_version -> search_result`.
- App đã có framing `Thư viện dữ liệu`, đã group sidebar theo `productName`, và đã có chỉnh metadata sản phẩm ở mức batch/video.
- `history_video.id` hiện là identity ổn định nhất của dataset ở frontend, đang được map thành `datasetId`.
- `history_video.file_name` hiện vẫn là khóa vận hành cho nhiều luồng như stream, trim, selection, và một phần import.
- `video_file` đã tồn tại nhưng mới chỉ như bảng cache scan thư viện, chưa đóng vai trò identity asset vật lý.
- Import hiện còn sinh `history_id` theo convention `import:<filename>`, nên filename đang bị dùng như một phần identity ở vài chỗ legacy.

Điểm lệch lớn nhất là domain hiện tại đã đủ để group theo sản phẩm một-một, nhưng chưa hỗ trợ tốt cho bài toán:

- một video tái sử dụng ở nhiều sản phẩm
- quản lý thư mục sản phẩm như thực thể riêng
- rename file thật mà vẫn giữ quan hệ dữ liệu cũ an toàn

## Phạm vi vòng này

Bao gồm:

- thêm `thư mục sản phẩm` là thực thể logic trong app
- cho phép một video liên kết nhiều thư mục
- thêm `thư mục chính` cho mỗi video để Library có một cây điều hướng rõ ràng
- đổi cách group Library từ `resolvedProductName` sang `primary product folder`
- thêm thao tác tạo, đổi tên, xóa thư mục sản phẩm
- thêm thao tác gắn video vào thư mục, gỡ khỏi thư mục, đổi thư mục chính
- thêm thao tác rename `filename` thật của video
- giữ toàn bộ dataset/history/version/search hiện có sau rename
- điều chỉnh API để frontend refresh được mọi dataset bị ảnh hưởng khi rename

Không bao gồm:

- chuyển `thư mục sản phẩm` thành thư mục thật trên ổ đĩa
- nhân bản dataset khi một video thuộc nhiều thư mục
- viết lại toàn bộ domain backend sang kiến trúc mới hoàn toàn
- thay đổi schema scene hoặc engine storyboard
- thêm bulk operations ở vòng đầu
- thêm search/filter nâng cao theo tên thư mục và tên video ở vòng đầu

## Hướng tiếp cận được chọn

Chọn hướng `primary folder + linked folders`, trong đó:

- `history_video.id` tiếp tục là identity của `dataset phân tích`
- `video_file.id` được nâng cấp thành identity của `video vật lý`
- `product_folder` là thực thể mới cho thư mục sản phẩm logic
- `product_folder_video` là bảng liên kết nhiều-nhiều giữa `video vật lý` và `thư mục sản phẩm`
- mỗi video có đúng một `primary_product_folder_id`

### Vì sao chọn hướng này

- Đáp ứng đúng yêu cầu một video thuộc nhiều thư mục nhưng UI vẫn rõ ràng.
- Giữ `datasetId/dbVideoId` ổn định nên không làm gãy version/search/storyboard hiện có.
- Tách được identity `video vật lý` khỏi `filename`, là điều kiện cần để rename file thật an toàn.
- Giảm thay đổi phá vỡ ở frontend vì sidebar vẫn có một cây chính `folder > video`.

### Các hướng đã cân nhắc

1. `Primary folder + linked folders`

- Đây là hướng được chọn.
- Cân bằng tốt nhất giữa yêu cầu nhiều thư mục và hành vi UI dễ hiểu.

2. `Many-to-many thuần, không có primary folder`

- Đúng mô hình reuse hơn về mặt dữ liệu.
- Nhưng Library, Search, Storyboard sẽ thiếu một product context mặc định, làm tăng độ mơ hồ ở UI và state.

3. `Filesystem-first`

- Hấp dẫn nếu app muốn trở thành file manager.
- Nhưng trái với yêu cầu hiện tại là `folder logic trong app`, và rủi ro cao cho flow stream/trim/import.

## Mô hình domain đề xuất

Hệ thống tách 2 lớp identity:

1. `Video vật lý`

- đại diện cho file thật trong `VIDEO_FOLDER`
- identity: `video_file.id`
- thuộc tính chính: `filename`, `size_bytes`, `modified_at`

2. `Dataset phân tích`

- đại diện cho một bản ghi phân tích/import/search đang sống trong domain hiện tại
- identity: `history_video.id`
- giữ quan hệ với `history`, `video_version`, `search_result`
- tham chiếu tới `video_file.id`

Nguyên tắc:

- rename file thật là thao tác trên `video vật lý`
- version/search/history là dữ liệu của `dataset phân tích`
- nhiều dataset có thể cùng tham chiếu một `video vật lý`
- rename một lần phải cập nhật mọi dataset đang tham chiếu video đó

## Thay đổi DB

### 1. Nâng cấp `video_file`

`video_file` trở thành bảng chuẩn đại diện cho asset vật lý.

Trường cần giữ hoặc củng cố:

- `id`
- `filename` unique
- `size_bytes`
- `modified_at`
- `last_scanned`

### 2. Liên kết dataset với video vật lý

Thêm `history_video.video_file_id` nullable trong migration đầu, sau đó backfill và dùng như foreign key logic tới `video_file.id`.

Sau khi backfill xong, mọi `history_video` đang có phải trỏ tới một `video_file` hợp lệ.

`history_video.file_name` vẫn được giữ ở vòng đầu để tránh rewrite lớn, nhưng được coi là denormalized field cần đồng bộ với `video_file.filename`.

### 3. Bảng `product_folder`

Thêm bảng mới:

- `id`
- `name`
- `created_at`
- `updated_at`
- `is_system`

Rule:

- có một folder hệ thống `Chưa phân loại`
- `Chưa phân loại` không được rename hoặc delete
- tên folder phải unique theo chuẩn so sánh mà app chọn, ưu tiên case-insensitive ở mức ứng dụng

### 4. Bảng `product_folder_video`

Thêm bảng liên kết:

- `product_folder_id`
- `video_file_id`
- `created_at`

Ràng buộc:

- unique trên cặp `(product_folder_id, video_file_id)`

### 5. Thư mục chính

Thêm `history_video.primary_product_folder_id` hoặc đặt `primary_product_folder_id` ở `video_file`.

Chọn đặt ở `video_file`.

Lý do:

- thư mục chính là metadata của `video vật lý`, không nên lệch giữa các dataset cùng trỏ một file
- rename và folder membership đều là thao tác ở cấp asset vật lý
- tránh trường hợp cùng một file thật xuất hiện dưới nhiều cây chính khác nhau chỉ vì khác dataset

Vậy trường đề xuất là `video_file.primary_product_folder_id`.

## Mapping dữ liệu hiển thị

Payload dataset trả về frontend phải bổ sung:

- `dbVideoId`
- `videoFileId`
- `fileName`
- `source`
- `primaryFolder`
- `linkedFolders`
- `linkedFolderCount`
- `status`
- `versions`
- `currentVersionIndex`
- `currentSearchKeywords`
- `matchedScenes`

Shape tối thiểu:

```ts
{
  dbVideoId: number;
  videoFileId: number;
  fileName: string;
  source: 'extension' | 'web';
  primaryFolder: { id: number; name: string };
  linkedFolders: Array<{ id: number; name: string }>;
}
```

Frontend tiếp tục build `DatasetItem`, nhưng group key trong Library chuyển từ `dataset.productName` sang `dataset.primaryFolder.name`.

`resolvedProductName` cũ không cần biến mất ngay ở vòng đầu, nhưng không còn là nguồn sự thật cho cây Library mới.

## Thiết kế UI

## Library Sidebar

Sidebar bên trái tiếp tục là cây điều hướng chính của `Thư viện dữ liệu`, nhưng đổi từ group tĩnh theo tên sản phẩm sang group theo `thư mục sản phẩm`.

Các thành phần chính:

1. Thanh công cụ

- nút `Tạo thư mục`
- filter `Tất cả / Chưa phân loại / Extension / Web`

2. Danh sách thư mục

- mỗi folder hiển thị `tên + số video primary`
- menu folder: `Đổi tên`, `Xóa`

3. Danh sách video trong folder mở

- mỗi video hiển thị `filename thật`
- badge nguồn `Extension` hoặc `Web`
- trạng thái dataset
- badge phụ nếu video còn liên kết thư mục khác, ví dụ `+2 thư mục`

Video chỉ hiện một lần trong tree, dưới `primary folder` của `video vật lý`.

Điều này tránh hiểu lầm rằng một video linked nhiều folder là nhiều dataset khác nhau.

## Video Detail Panel

Trong panel chi tiết bên phải, thêm block `Quản lý thư mục & tên file` gần header metadata.

Thành phần chính:

- input/dialog `Đổi tên file`
- hiển thị `thư mục chính`
- hiển thị danh sách `thư mục đã liên kết`
- action `Đặt thư mục chính`
- action `Gắn thêm vào thư mục khác`
- action `Gỡ khỏi thư mục`

Các action hiện có như switch version, play scene, trim, export SRT, mở qua Search, mở qua Storyboard vẫn giữ nguyên.

## Dialog và rule UI

### Rename file

Dialog rename hiển thị:

- tên cũ
- tên mới
- validate trùng tên
- cảnh báo rằng đây là rename file thật trong thư viện

Sau khi rename thành công:

- giữ nguyên video đang mở
- refresh sidebar và detail panel với tên mới
- không reset version đang chọn nếu dataset còn tồn tại

### Xóa folder

Nếu folder có video primary bên trong, dialog bắt buộc chọn một trong hai hướng:

- chuyển các video primary sang folder khác
- chuyển về `Chưa phân loại`

Không có trường hợp xóa folder và để video mất `primary folder`.

### Gỡ linked folder

- không tạo duplicate link
- không cho gỡ folder cuối cùng nếu chưa có primary thay thế
- nếu gỡ folder đang là primary thì phải chọn primary mới, hoặc hệ thống chuyển sang `Chưa phân loại`

## API đề xuất

## Giữ route cũ

Các route hiện có tiếp tục tồn tại ở vòng đầu:

- `GET /api/history`
- `POST /api/history/selection`
- `POST /api/analyze`
- `POST /api/search`
- `POST /api/import-analysis`
- `POST /api/storyboard/generate`

Nhưng payload của `GET /api/history` cần trả thêm metadata asset/folder mới.

## Route mới cho folder

- `GET /api/product-folders`
- `POST /api/product-folders`
- `PATCH /api/product-folders/{folder_id}`
- `DELETE /api/product-folders/{folder_id}`

Delete folder payload phải nhận một trong hai lựa chọn:

- `replacement_folder_id`, hoặc
- cờ chuyển về `Chưa phân loại`

## Route mới cho video vật lý

- `POST /api/video-files/{video_file_id}/rename`
- `POST /api/video-files/{video_file_id}/folders`
- `DELETE /api/video-files/{video_file_id}/folders/{folder_id}`
- `POST /api/video-files/{video_file_id}/primary-folder`

### Vì sao route mới đi theo `video_file_id`

- rename file thật là thao tác ở cấp asset vật lý
- folder membership cũng là metadata của asset vật lý
- một thao tác rename phải tự động áp dụng cho mọi dataset cùng tham chiếu video đó

## Điều chỉnh dần route selection

Ở trạng thái hiện tại, `POST /api/history/selection` đang nhận `history_id + filename`.

Trong vòng này, frontend và backend sẽ chuyển sang route selection mới dùng `dbVideoId` làm khóa chính cho dataset selection state. Route cũ được giữ tạm thời để tránh break compatibility nội bộ, nhưng UI chính của app không còn gửi selection theo `filename` nữa.

## Data flow chi tiết

## 1. Load library

- frontend gọi `GET /api/history`
- backend trả history như hiện tại, nhưng mỗi video kèm `videoFileId`, `primaryFolder`, `linkedFolders`
- frontend build `datasetItems`
- Library group theo `primaryFolder.name`

## 2. Rename file thật

- frontend gọi `POST /api/video-files/{video_file_id}/rename`
- backend validate tên mới
- kiểm tra file trùng trong `VIDEO_FOLDER`
- rename file trên disk
- update `video_file.filename`
- update mọi `history_video.file_name` đang tham chiếu asset đó
- update `history.date` của mọi history bị ảnh hưởng để UI phản ánh rename như một thay đổi metadata mới nhất
- trả về tập history đã bị ảnh hưởng hoặc payload refresh gọn hơn nhưng đủ để frontend rehydrate state

Nguyên tắc bắt buộc:

- không tạo `history_video` mới
- không tạo `video_version` mới
- không mất `search_result`
- sau rename, stream/trim/storyboard phải dùng tên mới

## 3. Thêm folder link

- frontend chọn folder từ detail panel
- backend insert vào `product_folder_video`
- thêm linked folder không tự đổi primary
- chỉ đổi primary khi người dùng bấm action riêng

## 4. Đổi primary folder

- frontend gọi route riêng
- backend validate video đã linked folder đó hoặc tự thêm link trước khi set primary
- update `video_file.primary_product_folder_id`
- trả payload cập nhật để Library di chuyển video sang group mới

## 5. Xóa folder

- backend chặn xóa `Chưa phân loại`
- backend tìm mọi video có primary ở folder đó
- nếu request không truyền replacement hợp lệ thì reject
- nếu replacement là `Chưa phân loại` thì set primary về folder hệ thống
- xóa toàn bộ link của folder sau khi đã chuyển primary hợp lệ

## Migration dữ liệu cũ

## Bước 1. Backfill `video_file`

- scan các `history_video.file_name` hiện có
- đảm bảo mỗi filename có một dòng `video_file`
- gắn `history_video.video_file_id` theo filename

## Bước 2. Tạo folder hệ thống

- tạo `Chưa phân loại`

## Bước 3. Tạo folder từ dữ liệu cũ

Với mỗi dataset hiện có:

- lấy `resolvedProductName`
- nếu chưa có folder tương ứng thì tạo mới
- link `video_file` vào folder đó
- set folder đó làm `primary folder` nếu video chưa có primary

Nếu nhiều dataset của cùng một `video_file` mang nhiều `resolvedProductName` khác nhau:

- tất cả folder tương ứng đều được tạo link
- chọn `primary folder` theo dataset có `history.date` mới nhất

Rule này được chọn để migration có tính quyết định, tránh cần hỏi lại người dùng.

## Bước 4. Giữ nguyên legacy identity

- `history.id`, kể cả dạng `import:<filename>`, không rewrite ở vòng đầu
- source tiếp tục dựa vào cột `source`, không dựa vào `history_id`
- trong chính vòng này, luồng import phải resolve dataset import theo `video_file_id` đã backfill thay vì coi `filename` là identity lâu dài; `history_id` legacy vẫn được giữ nguyên nhưng không còn là căn cứ duy nhất để nhận diện cùng một video sau rename

## Error handling

## Rename file

Chặn các trường hợp:

- tên rỗng
- tên chỉ chứa khoảng trắng
- tên có path traversal hoặc ký tự không hợp lệ theo rule backend
- tên trùng file đã có trong `VIDEO_FOLDER`
- file vật lý không còn tồn tại tại thời điểm rename

Thứ tự an toàn:

1. validate đầu vào
2. resolve asset hiện tại
3. rename file trên disk
4. update DB
5. nếu DB fail, cố rollback tên file cũ trên disk

Nếu rollback DB hoặc filesystem không hoàn chỉnh, API phải trả lỗi mức cao để UI báo người dùng rằng thư viện đang ở trạng thái cần kiểm tra thủ công.

## Folder operations

- không cho rename thành tên đã tồn tại
- không cho delete folder hệ thống
- không cho video rơi vào trạng thái không có primary folder
- không cho tạo duplicate link giữa video và folder

## Tác động tới frontend hiện tại

`src/App.tsx` hiện đang group dataset bằng `dataset.productName`.

Vòng này cần thay các phần sau:

- `buildDatasetItems` phải map thêm `videoFileId`, `primaryFolder`, `linkedFolders`
- `groupedDatasets` đổi key group từ `productName` sang `primaryFolder.name`
- `LibraryPage`, `ProductVideoList`, `ProductGroup`, `VideoDetailPanel` cần nhận metadata folder mới
- các action hiện đang gọi API theo `datasetId` chỉ giữ cho thao tác dataset; rename và folder management đi theo `videoFileId`

Mục tiêu là giới hạn đổi behavior chủ yếu trong domain thư viện, không lan refactor rộng sang các màn khác nếu không cần thiết.

## Testing và xác nhận hoàn thành

## Backend smoke cases

- rename file thành công, sau đó `/api/videos/{filename}/stream` hoạt động với tên mới
- trim dùng tên mới thành công
- analyze/search trên dataset cũ vẫn lưu tiếp vào dataset cũ sau rename
- một `video_file` có nhiều dataset tham chiếu, rename một lần cập nhật đồng bộ mọi dataset
- tạo, đổi tên, xóa folder hoạt động đúng rule
- xóa folder có video primary sẽ chuyển primary đúng folder thay thế hoặc `Chưa phân loại`

## Frontend smoke cases

- Library group theo `primary folder`
- video linked nhiều folder nhưng chỉ hiện một lần trong tree
- detail panel hiển thị đúng linked folders và primary folder
- rename file xong vẫn giữ selection hiện tại
- mở sang Search và Storyboard từ video đã rename vẫn dùng dataset/version hiện tại

## Verify repo

- `npm run lint`
- `npm run build`
- kiểm thử tay backend do repo hiện chưa có Python test suite

## Đề xuất thêm sau vòng đầu

- bulk assign folder cho nhiều video
- bulk rename theo pattern
- search theo tên folder và tên file
- recent folders / suggested folders khi upload hoặc import
- cân nhắc thêm `display name` tách khỏi `filename` thật để giảm nhu cầu rename vật lý cho các chỉnh sửa nhỏ về mặt hiển thị

## Tiêu chí chấp nhận

Tính năng được xem là hoàn thành khi:

- người dùng tạo, đổi tên, xóa được `thư mục sản phẩm` logic trong app
- một video gắn được nhiều folder nhưng có đúng một primary folder
- Library điều hướng theo primary folder thay vì product label cũ
- người dùng rename được `filename` thật của video
- sau rename, mọi dataset/history/version/search cũ vẫn dùng được
- stream, trim, search, storyboard không bị gãy vì filename cũ
- không phát sinh dataset mới chỉ vì rename file
