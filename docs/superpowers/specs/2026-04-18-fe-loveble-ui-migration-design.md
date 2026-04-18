# Thiết Kế Chuyển Toàn Bộ Frontend Sang Giao Diện `fe_loveble`

## Mục tiêu

Đổi toàn bộ giao diện của app hiện tại sang visual system và cấu trúc màn hình của bộ thiết kế `fe_loveble`, áp dụng cho đủ 3 khu:

- `Thư viện dữ liệu`
- `Tìm phân cảnh`
- `Storyboard`

Mục tiêu của vòng này là thay đổi frontend để bám sát giao diện mới nhưng vẫn giữ được đầy đủ hành vi nghiệp vụ đang chạy với backend hiện tại.

Các quyết định đã chốt với người dùng:

- ưu tiên số 1 là giữ đủ tính năng hiện tại
- phạm vi là cả 3 khu, không làm riêng từng page
- chấp nhận mang khá nhiều cấu trúc frontend từ `fe_loveble` sang nếu cần
- ưu tiên desktop trước, mobile chỉ cần không vỡ
- frontend nên tách mạnh theo cấu trúc của mẫu mới, không giữ `App.tsx` kiểu monolith
- chức năng phải đi theo giao diện mới; nếu giao diện mới không có chỗ phù hợp cho một chức năng cũ thì phải xác nhận lại với người dùng trước khi thêm hoặc đổi layout

## Bối cảnh hiện tại

- App hiện tại là Vite + React + Tailwind, nhưng gần như toàn bộ state, API wiring, video control, và markup đang nằm trong `src/App.tsx`.
- App có 3 khu nghiệp vụ chính: `Library`, `Search`, `Storyboard`.
- Backend FastAPI và các API hiện tại đang hoạt động thật; đợt này không đổi contract backend làm mục tiêu chính.
- Bộ thiết kế `fe_loveble` là một frontend tách page/component rõ ràng hơn nhiều, có sẵn cấu trúc cho `LibraryPage`, `SearchPage`, `StoryboardPage`, cùng nhiều UI primitive hỗ trợ.

Điểm lệch lớn nhất hiện tại không phải ở nghiệp vụ, mà ở tổ chức frontend:

- app thật đang monolithic và render trực tiếp từ một file rất lớn
- app mẫu đã tách theo page, panel, shared component, và layout shell rõ ràng

Vì vậy, đổi giao diện lần này cần đi kèm một đợt tái tổ chức frontend đủ mạnh để cấu trúc code khớp với giao diện mới, thay vì chỉ đổi className trên file cũ.

## Phạm vi

Bao gồm:

- chuyển toàn bộ app sang layout và visual language của `fe_loveble`
- tách frontend thành app shell và 3 page chính
- tách các panel, card, list, input area, preview area thành component nhỏ hơn theo page
- giữ đầy đủ integration với backend thật cho các luồng hiện có
- giữ các hành vi điều hướng chéo giữa `Library`, `Search`, `Storyboard`
- map lại các state hiện tại vào page controller hoặc domain hook tương ứng
- chuẩn hóa các trạng thái `loading`, `empty`, `error`, `success`, `disabled` trong UI mới
- thiết lập cơ chế xử lý `UI gap` để mọi chỗ không khớp giữa tính năng cũ và mockup mới đều phải được xác nhận lại với người dùng

Không bao gồm:

- đổi contract backend chỉ để phù hợp với mock frontend mới
- rewrite logic nghiệp vụ ở backend
- thêm tính năng sản phẩm mới ngoài những gì app hiện có đang hỗ trợ
- tự thiết kế thêm block ngoài mẫu mới mà chưa hỏi lại người dùng khi gặp `UI gap`
- tối ưu mobile sâu trong vòng này

## Hướng tiếp cận được chọn

Chọn hướng `ghép giao diện và cấu trúc page của fe_loveble lên logic thật của app hiện tại`, thay vì:

1. chỉ phủ lại style trên `App.tsx`
2. bê nguyên mock app của `fe_loveble` sang rồi nối logic thật sau

### Vì sao chọn hướng này

- Giữ được đầy đủ hành vi và integration đang chạy với backend thật.
- Cho phép frontend đi gần cấu trúc của mẫu mới ngay từ đầu, nên code sau đợt đổi UI sẽ dễ hiểu và dễ tiếp tục làm việc hơn.
- Giảm rủi ro so với việc port nguyên một mock app vốn đang dùng dữ liệu giả và stack rộng hơn mức cần thiết.
- Tránh giải pháp nửa vời kiểu chỉ đổi màu và layout nhưng lõi UI vẫn bị khóa trong một file rất lớn.

### Các hướng đã cân nhắc

1. Ghép UI mẫu lên logic thật và tách lại frontend theo page/module

- Đây là hướng được chọn.
- Cân bằng tốt nhất giữa fidelity với mockup và độ an toàn của nghiệp vụ hiện tại.

2. Port mạnh theo toàn bộ cấu trúc kỹ thuật của `fe_loveble`

- Có thể cho kết quả gần mockup nhất.
- Nhưng dễ kéo theo router, test stack, query pattern, và dependency không phục vụ trực tiếp cho app thật ở phase này.

3. Chỉ làm lớp vỏ giao diện trước, giữ gần như nguyên toàn bộ lõi `App.tsx`

- Nhanh hơn trong ngắn hạn.
- Nhưng sẽ để lại frontend khó bảo trì, và các mismatch giữa mock layout với logic thật sẽ càng khó gỡ về sau.

## Kiến trúc frontend mới

Frontend mới sẽ được tổ chức lại theo hướng gần với `fe_loveble` hơn:

- `App.tsx` hoặc app root chỉ còn vai trò shell cấp cao
- 3 khu chính trở thành 3 page/module riêng
- mỗi page có page controller hoặc domain hook riêng
- các action nghiệp vụ dùng chung được tách thành service/helper độc lập

### App shell

App shell chịu trách nhiệm:

- render sidebar điều hướng chính
- quyết định page đang active
- giữ các provider hoặc state dùng chung thật sự toàn app
- điều phối các handoff liên page khi cần

App shell không còn giữ phần lớn state nghiệp vụ của từng page.

### Page-level controller

Mỗi page có state riêng của nó thay vì để mọi thứ ở root:

- `LibraryPage`: active dataset, active version, source filter, view mode, scene selection, metadata edit state
- `SearchPage`: product name của phiên, keyword input, upload queue, analyze state, session videos, result display state
- `StoryboardPage`: form input, selected source versions, generate state, selected beat, preview state

Mục tiêu là chia nhỏ state theo đúng nơi người dùng thao tác, để code gần với mental model của UI mới.

### Shared service và mapper

Những phần không nên gắn cứng vào page:

- API client
- mapper dữ liệu backend sang UI model
- helper play scene và sync video time
- helper trim, export, download
- utility format time, status badge, source badge

Điều này giúp page component tập trung vào hiển thị và thao tác, không ôm cả parsing và orchestration như hiện tại.

## Thiết kế màn hình

### 1. `LibraryPage`

`LibraryPage` tiếp tục là nơi xem dữ liệu đã lưu trong DB, nhưng bố cục đi theo mẫu mới: danh sách bên trái, chi tiết bên phải.

Phần giữ theo `fe_loveble`:

- header page
- master-detail layout
- danh sách nhóm/video ở panel trái
- detail panel ở phần phải

Những gì phải map từ app thật sang:

- filter nguồn dữ liệu
- group theo sản phẩm
- chọn dataset active
- hiển thị badge nguồn và trạng thái dataset
- chuyển version
- xem `matched` hoặc `full`
- phát video theo scene
- trim clip
- export SRT
- cập nhật tên sản phẩm mặc định hoặc override theo video
- áp dụng lại search result đã lưu
- mở dataset sang `Search`
- chọn version cho `Storyboard`
- xóa dataset

Rule thiết kế của page này là: chỉ đặt chức năng vào những vùng mà giao diện mới có chỗ hợp lý. Nếu một hành vi hiện tại không có vị trí rõ ràng trong layout mới, nó phải được ghi nhận là `UI gap` và xác nhận lại với người dùng.

### 2. `SearchPage`

`SearchPage` giữ bố cục 2 cột của mẫu:

- cột trái là input panel
- cột phải là kết quả và trạng thái video trong phiên

Phần bên trái sẽ nhận các chức năng sau nếu chúng khớp tự nhiên với UI mẫu:

- nhập tên sản phẩm cho phiên
- nhập từ khóa
- upload video
- hiển thị danh sách video trong phiên
- trigger analyze
- bắt đầu phiên mới

Phần bên phải hiển thị:

- video result card theo từng video
- trạng thái `pending/analyzing/success/error`
- scene list hoặc keyword matches
- error message theo từng video nếu có

Khi `LibraryPage` chuyển một dataset sang `SearchPage`, page này phải nhận đúng context cần thiết để hiển thị lại video/version/search liên quan, thay vì tạo một session rỗng.

### 3. `StoryboardPage`

`StoryboardPage` giữ nhịp 3 cột của mẫu:

- input form
- source picker hoặc beat list
- preview panel

Page này cần hỗ trợ đủ các hành vi đang có:

- nhập thông tin sản phẩm, audience, tone, benefits, script
- chọn source version từ dữ liệu đã lưu
- generate storyboard
- xem danh sách beat
- xem match cho beat đang chọn
- preview footage đúng theo khoảng thời gian scene

Các source hiển thị trên page phải đến từ dữ liệu backend thật, không dùng mock source của app mẫu.

## Luồng dữ liệu và điều hướng chéo

Đợt đổi giao diện này không đặt mục tiêu đổi API contract. Backend hiện tại vẫn là nguồn dữ liệu thật.

Frontend mới sẽ thêm một lớp chuyển đổi dữ liệu:

- backend payload -> UI model dùng trong page mới
- state lưu trong page -> payload gửi lại backend

Các action điều hướng chéo giữa page phải có cơ chế handoff rõ ràng, ví dụ:

- mở dataset từ `Library` sang `Search`
- lấy version đang active trong `Library` sang `Storyboard`
- quay lại `Library` mà vẫn giữ selection liên quan nếu phù hợp

Các action này không nên được cài trực tiếp trong JSX của từng card như hiện tại. Chúng nên đi qua page action hoặc service điều phối nhỏ để page đích nhận đúng context ban đầu.

## Strategy cho dependency và component reuse

`fe_loveble` có nhiều dependency và UI primitive hơn app hiện tại. Thiết kế của vòng này không yêu cầu bê toàn bộ stack đó sang một cách cơ học.

Rule được chọn:

- được phép mang sang các primitive, component pattern, hoặc dependency thực sự giúp tái tạo layout và interaction của mẫu mới
- không bắt buộc mang sang router, query library, test stack, hoặc bất cứ phần nào không phục vụ trực tiếp cho đợt đổi UI
- ưu tiên reuse component structure của mẫu hơn là reuse nguyên data layer mock của nó

Nói cách khác, `fe_loveble` là nguồn cho UI architecture và component language, không phải nguồn chân lý cho app behavior.

## Nguyên tắc xử lý `UI gap`

`UI gap` là trường hợp một chức năng hiện tại không có vị trí tự nhiên trong giao diện mới.

Đây là rule bắt buộc của spec:

1. ưu tiên map chức năng vào đúng vùng tương ứng đã có trong mẫu mới
2. nếu không map được một cách rõ ràng, đánh dấu là `UI gap`
3. không tự thêm block mới hoặc biến dạng layout lớn để nhét tính năng vào
4. dừng tại điểm đó và xác nhận lại với người dùng trước khi triển khai tiếp

Rule này đảm bảo implementation luôn đi theo giao diện mới, đúng với quyết định của người dùng, thay vì âm thầm mở rộng mockup trong lúc làm.

## Error handling và trạng thái hiển thị

UI mới phải thể hiện rõ các trạng thái chính sau đây ở đúng ngữ cảnh page:

- `loading`
- `empty`
- `error`
- `disabled`
- `success`

Yêu cầu cụ thể:

- lỗi analyze, search, storyboard, dataset update, dataset delete phải hiện gần thao tác gây ra lỗi
- không dồn mọi lỗi vào một vùng thông báo chung nếu page đã có ngữ cảnh hiển thị riêng
- page không được để trống khó hiểu khi chưa có dữ liệu hoặc khi không có kết quả khớp
- trạng thái đang xử lý phải khóa hoặc làm rõ action liên quan để tránh thao tác lặp

## Verification

Đợt đổi UI này được coi là hoàn thành khi đạt đủ các điều kiện sau:

1. frontend dùng giao diện mới nhất quán với `fe_loveble` trên cả 3 khu `Library`, `Search`, `Storyboard`
2. các luồng backend hiện tại vẫn chạy qua UI mới
3. không mất các hành vi cốt lõi của app hiện tại trừ khi đã được người dùng chấp nhận rõ ràng
4. mọi chỗ lệch khỏi mockup vì không có chỗ chứa chức năng đều đã được xác nhận lại với người dùng

Các bước verify tối thiểu:

- `npm run lint`
- `npm run build`
- manual flow cho `Library`, `Search`, `Storyboard` với backend thật
- regression check cho các luồng quan trọng:
  - upload và analyze
  - mở dataset từ `Library` sang `Search`
  - chọn source version cho `Storyboard`
  - preview match
  - trim và tải clip
  - export SRT
  - đổi version và áp dụng search result đã lưu

## Kết quả mong muốn

Sau vòng này, app không chỉ có giao diện mới nhìn giống `fe_loveble`, mà còn có cấu trúc frontend gần với mẫu mới hơn:

- dễ đọc hơn
- dễ map nghiệp vụ hơn
- dễ tiếp tục tách nhỏ hoặc mở rộng ở các vòng sau

Quan trọng hơn, toàn bộ việc triển khai sẽ bám vào giao diện mới làm chuẩn hiển thị, còn những chỗ không khớp sẽ được xác nhận lại với người dùng thay vì tự suy diễn.
