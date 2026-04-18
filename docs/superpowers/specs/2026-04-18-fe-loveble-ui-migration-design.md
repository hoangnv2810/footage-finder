# Thiết Kế Thay Toàn Bộ Frontend Sang Giao Diện `data-library-view-main`

## Mục tiêu

Thay hoàn toàn frontend của `footage-finder` bằng frontend từ `C:\Users\hoang\OneDrive\Desktop\Workspace\Aff\assets\fe_loveble\data-library-view-main\data-library-view-main`, giữ backend FastAPI hiện tại, và ghép lại các API đang có vào UI mới mà không quay lại giao diện cũ.

Kết quả mong muốn của vòng này là repo đích hoạt động như một bản của project nguồn đã được cấy backend thật, thay vì một bản frontend cũ được thay da đổi thịt.

## Quyết định Đã Chốt

- Xóa sạch giao diện cũ trước khi bê giao diện mới sang.
- Không giữ song song hai bộ UI.
- Không giữ fallback sang UI cũ.
- Bê gần nguyên `src/` của project nguồn; UI, layout, component tree, router, và visual language của project nguồn là chuẩn hiển thị.
- Mang toàn bộ stack frontend cần thiết của project nguồn để `src` mới chạy đúng.
- Không dùng API bridge hoặc adapter để đổi shape response.
- Frontend mới phải tuân theo response hiện tại của API backend.
- Nếu API thiếu dữ liệu cho một block của UI mới, chỉ phần dữ liệu thiếu đó mới được lấp bằng `fake/mock`.
- `fake/mock` không được thay cho nghiệp vụ lõi đã có API thật.
- Backend hiện tại trong `server/` không phải mục tiêu redesign của vòng này.

## Nguồn Chuẩn Của Từng Phần

Để tránh nhập nhằng trong lúc triển khai, spec này chốt rõ nguồn chuẩn của từng lớp:

- `Project nguồn`: chuẩn cho giao diện, cấu trúc page, router, component tree, styling, và frontend stack.
- `Backend hiện tại`: chuẩn cho API contract, dữ liệu thật, persistence, upload, analyze, search, trim, storyboard, và lịch sử lưu DB.
- `Fake/mock`: chỉ là nguồn phụ để lấp dữ liệu còn thiếu ở UI mới khi backend hiện tại chưa trả đủ.

Điều này có nghĩa là frontend mới phải thích nghi với response thật của backend hiện có, còn phần dữ liệu thiếu của UI mới sẽ được bù tạm bằng fake tại đúng block cần hiển thị.

## Phạm Vi

### Bao gồm

- Xóa toàn bộ frontend UI cũ của repo đích trước khi nhập frontend mới.
- Bê gần nguyên frontend từ project nguồn vào repo đích.
- Mang theo dependency, config, router, CSS, UI primitives, hooks, util, và asset frontend cần thiết để source mới chạy đúng.
- Giữ backend FastAPI hiện tại làm nguồn dữ liệu thật duy nhất.
- Ghép 3 page chính `Library`, `Search`, `Storyboard` với API hiện có.
- Dùng `fake/mock` có chủ đích cho các block UI mới thiếu dữ liệu backend.
- Giữ một đường chạy frontend duy nhất là giao diện mới.

### Không bao gồm

- Giữ lại hoặc duy trì song song giao diện cũ.
- Đổi contract backend chỉ để hợp với UI mới.
- Viết adapter để map response backend sang một view-model trung gian khác shape gốc.
- Refactor backend ngoài những chỉnh sửa hạ tầng nhỏ thật sự cần để frontend mới gọi được API cũ mà không làm đổi contract hiện tại.
- Thêm tính năng sản phẩm mới không có trong project nguồn và cũng không có trong app hiện tại.

## Kiến Trúc Tổng Thể

Hướng triển khai được chọn là `full transplant + direct API integration`.

Trình tự kiến trúc ở mức cao:

1. Xóa hẳn frontend UI cũ trong repo đích.
2. Đưa frontend của project nguồn vào làm nền chính.
3. Đưa stack frontend tương ứng vào để app mới chạy được đúng như source mới.
4. Giữ backend hiện tại nguyên vai trò nguồn dữ liệu thật.
5. Ghép lần lượt các API hiện có vào các page của frontend mới.
6. Chỗ nào backend chưa trả đủ dữ liệu cho UI mới thì giữ đúng layout và lấp phần thiếu bằng `fake/mock`.

Sau bước này, app chỉ còn một app shell, một router, một bộ page, và một hệ component là của giao diện mới.

## Phạm Vi Xóa Và Thay Thế

### Xóa trước khi nhập giao diện mới

Những phần frontend UI cũ của repo đích phải bị xóa trước:

- toàn bộ `src/` hiện tại của `footage-finder`
- các component, page, layout, hook, lib, và CSS chỉ phục vụ giao diện cũ
- `App.tsx` cũ theo kiểu orchestration monolith
- điều hướng bằng state nội bộ của app cũ

### Giữ lại

Những phần sau không nằm trong phạm vi xóa:

- `server/`
- API backend hiện có
- file môi trường và config backend
- dữ liệu SQLite, lịch sử phân tích, file upload, và các runtime dependency của backend
- các cấu hình repo chỉ cần giữ lại để frontend mới vẫn nói chuyện được với backend hiện tại

### Bê sang từ project nguồn

Spec này chốt bê gần nguyên các phần frontend từ project nguồn:

- `src/`
- app shell và route structure
- shadcn/ui primitives và component phụ trợ
- hooks và util của source mới
- CSS entrypoint, token, và styling structure
- frontend dependency stack cần cho source mới chạy đúng
- config frontend liên quan trực tiếp đến source mới như alias, Vite, Tailwind, PostCSS, lint, test nếu chúng là một phần của runtime và workflow mới

## Dependency, Router, Và Config Frontend

### Dependency

Mục tiêu của vòng này không phải tối giản dependency. Mục tiêu là giữ source mới chạy đúng. Vì vậy repo đích được phép mang gần đầy đủ stack frontend của project nguồn nếu đó là điều kiện để `src` mới hoạt động ổn định.

Các nhóm dependency được coi là trong phạm vi hợp lệ:

- router
- shadcn/ui và các radix primitive liên quan
- utility package mà component mới đang dùng trực tiếp
- styling stack của source mới
- package hỗ trợ animation, form, query, toast, panel, chart, hoặc interaction nếu source mới dùng thật

### Router

Router của project nguồn trở thành router chính của app mới.

Điều này kéo theo các quyết định sau:

- `Library`, `Search`, `Storyboard` đi theo route structure của source mới
- layout shell của source mới là shell duy nhất
- không giữ navigation state kiểu app cũ trong `App.tsx`
- các thao tác chuyển trang từ `Library` sang `Search` hoặc `Storyboard` phải đi theo router mới, dùng đúng context tối thiểu cần truyền đi

### Config frontend

Project nguồn là chuẩn tham chiếu cho phần lớn config frontend, nhưng repo đích vẫn phải giữ các ràng buộc cần cho backend hiện tại hoạt động.

Nguyên tắc cấu hình:

- ưu tiên config của source mới cho frontend runtime
- giữ proxy `/api` để trỏ về backend FastAPI hiện tại
- giữ môi trường dev sao cho frontend mới và backend hiện tại vẫn chạy cùng nhau được
- nếu có xung đột cấu hình giữa app cũ và app mới, ưu tiên app mới trừ các điểm bắt buộc để backend integration tiếp tục hoạt động

## Quy Tắc Ghép API

Spec này chốt một nguyên tắc cứng:

- không có API bridge
- không có adapter đổi shape response
- không có tầng view-model trung gian khác cấu trúc response thật

Điều này có nghĩa là page, hook, hoặc helper gọi API chỉ được phép làm các việc sau:

- gọi đúng endpoint hiện có
- xử lý request lifecycle
- kiểm tra lỗi
- đọc trực tiếp response theo shape backend hiện tại trả về

Chúng không được phép biến response sang một schema trung gian mới để hợp UI.

Khi UI mới cần thêm dữ liệu mà backend chưa có, phần thiếu đó phải được cấp bằng `fake/mock` ngay tại page hoặc block đang cần, thay vì đổi shape dữ liệu thật.

## Thiết Kế Theo Từng Page

### `LibraryPage`

`LibraryPage` ưu tiên dùng dữ liệu thật ở mức cao nhất vì backend hiện tại đã có dữ liệu thư viện, lịch sử, version, scene, và metadata nền tảng.

Phần phải chạy `live`:

- danh sách dataset hoặc video đã lưu
- chọn dataset active
- version hiện có của video
- scene list
- thông tin video cơ bản có sẵn từ backend
- các action đã có API thật như xóa, trim, export, update tên nếu backend hiện hỗ trợ
- thao tác mở sang page khác nếu chỉ cần dùng state hoặc context hiện có trên frontend

Phần được phép `fake/mock`:

- badge phụ
- số liệu phụ
- metadata bổ sung chỉ để lấp đầy giao diện mới
- khối insight, summary, hoặc label trang trí mà backend hiện chưa có dữ liệu tương ứng

Nguyên tắc của page này là UI giữ đúng source mới, còn dữ liệu nào backend có thì đổ trực tiếp, dữ liệu nào backend thiếu thì fake đúng phần thiếu đó.

### `SearchPage`

`SearchPage` phải ghép `live` mạnh vì upload, analyze, SSE, và keyword search là nghiệp vụ lõi đang chạy thật.

Phần phải chạy `live`:

- upload video
- danh sách video trong phiên được giữ từ flow upload và analyze hiện có của frontend mới, không đòi thêm một API session mới
- analyze flow
- SSE streaming state
- full analysis result
- keyword search result
- trạng thái `pending`, `analyzing`, `success`, `error`

Phần được phép `fake/mock`:

- card phụ hoặc data summary mà UI mới muốn hiển thị thêm nhưng backend chưa trả
- số liệu trang trí không thuộc flow chính
- dữ liệu tạm để giữ đủ bố cục ở các vùng phụ của màn hình

Page này không được fake phần kết quả chính nếu API thật đã có dữ liệu tương ứng.

### `StoryboardPage`

`StoryboardPage` phải ghép `live` ở các phần backend hiện đã hỗ trợ generate storyboard và chọn source từ dữ liệu đã lưu.

Phần phải chạy `live`:

- form generate storyboard
- danh sách source hoặc version lấy từ dữ liệu lưu thật
- gọi API generate storyboard
- beat list và match result ở những trường backend hiện trả được
- preview footage theo `scene.start/end` khi dữ liệu scene có sẵn

Phần được phép `fake/mock`:

- metadata phụ của preview panel
- note, score, summary, hoặc thông tin trình bày thêm mà backend chưa có
- block phụ cần dữ liệu để giữ đúng layout mới nhưng chưa ảnh hưởng đến flow generate hoặc preview chính

Giống hai page còn lại, page này phải ưu tiên live cho lõi nghiệp vụ và chỉ dùng fake cho phần dữ liệu bổ sung còn thiếu.

## Điều Hướng Và Truyền Context Giữa Page

Vì router của source mới là router chính, các hành vi liên page phải đi theo đường này thay vì quay lại mô hình state monolith cũ.

Những handoff cần giữ:

- mở từ `Library` sang `Search`
- mở từ `Library` sang `Storyboard`
- giữ lại context tối thiểu để page đích biết đang mở dataset, file, hoặc version nào

Nguyên tắc của spec:

- chỉ truyền đúng context tối thiểu cần dùng
- không tái dựng root state cũ để điều phối toàn app
- không nhúng lại cấu trúc UI cũ để giải quyết điều hướng chéo

## Quy Tắc Dùng `Fake/Mock`

`Fake/mock` chỉ là phần đệm để giữ bố cục và visual completeness của giao diện mới khi backend chưa có đủ dữ liệu.

Spec chốt các quy tắc sau:

- chỉ fake phần dữ liệu backend đang thiếu
- không fake toàn bộ một flow lõi nếu API thật đã hỗ trợ flow đó
- không đổi contract backend chỉ để loại bỏ fake
- fake phải được đặt cục bộ theo page hoặc block đang cần, không xây một tầng dữ liệu trung gian mới
- khi backend sau này trả đủ dữ liệu, phần fake phải thay được bằng dữ liệu thật mà không cần đổi lại layout lớn

## Error Handling

Frontend mới sẽ có các page vừa dùng `live` vừa dùng `fake`, nên error handling phải rõ ngữ cảnh.

Quy tắc hiển thị lỗi:

- lỗi gọi API thật phải hiện tại đúng page hoặc block đang dùng dữ liệu live
- lỗi thao tác chính như upload, analyze, search, storyboard generate, delete, trim phải hiện gần action gây ra lỗi
- page vẫn phải giữ shell và layout của giao diện mới, không đổ sập toàn trang chỉ vì một block live lỗi
- block đang dùng fake không được chặn flow live của cùng page
- empty state, loading state, disabled state, và error state phải được thể hiện trong vùng nội dung tương ứng thay vì đẩy mọi thứ vào một thông báo chung

## Verification

Việc thay frontend chỉ được coi là đạt khi qua đủ ba lớp verify sau.

### 1. Build và runtime

- cài dependency frontend mới thành công
- `npm run lint` chạy được trên repo sau khi transplant frontend
- `npm run build` chạy được trên repo sau khi transplant frontend
- frontend dev server chạy được cùng backend FastAPI hiện tại
- proxy `/api` tiếp tục trỏ đúng backend hiện tại

### 2. Verify theo page

- `LibraryPage` lên đúng layout của source mới và đọc được dữ liệu thư viện thật ở các vùng lõi
- `SearchPage` chạy được flow upload, analyze, SSE, và search thật
- `StoryboardPage` gọi generate thật và hiển thị được dữ liệu thật ở các vùng backend đã hỗ trợ

### 3. Verify phần `fake/mock`

- các vùng chưa có dữ liệu backend vẫn render đúng layout bằng fake data
- fake data không làm hỏng các flow live
- không có chỗ nào quay lại render giao diện cũ

## Tiêu Chí Hoàn Thành

Redesign này được coi là hoàn thành khi đạt đủ các điều kiện sau:

1. giao diện cũ đã bị xóa trước khi nhập giao diện mới
2. frontend mới từ project nguồn trở thành frontend chính duy nhất của repo
3. router, layout, component tree, và visual language của source mới là đường chạy thực tế của app
4. backend hiện tại vẫn dùng được qua `/api` mà không cần đổi contract
5. `Library`, `Search`, và `Storyboard` chạy trên giao diện mới
6. các nghiệp vụ lõi dùng dữ liệu thật ở những nơi backend đã hỗ trợ
7. phần dữ liệu còn thiếu của UI mới được lấp bằng fake/mock có chủ đích
8. không còn đường chạy nào của UI cũ trong app

## Tóm Tắt Thiết Kế

Spec này thay hoàn toàn định hướng cũ từ `ghép giao diện mới lên frontend hiện tại` sang `xóa frontend cũ, bê frontend mới vào làm chuẩn, rồi ghép trực tiếp API backend hiện có`.

Ba nguyên tắc quan trọng nhất của thiết kế là:

- giao diện cũ phải biến mất trước khi giao diện mới đi vào repo
- frontend mới phải đi theo source mới và response backend hiện tại, không qua adapter đổi shape
- phần dữ liệu backend còn thiếu được phép fake đúng chỗ, nhưng không được thay cho các luồng nghiệp vụ lõi đã có API thật
