# Kế Hoạch Triển Khai Thay Toàn Bộ Frontend Sang `data-library-view-main`

## Ghi chú

Skill `writing-plans` không có sẵn trong môi trường hiện tại, nên plan này được cập nhật thủ công sau khi spec `2026-04-18-fe-loveble-ui-migration-design.md` đã được duyệt.

## Mục tiêu triển khai

Triển khai frontend mới theo đúng spec đã chốt:

- xóa hẳn giao diện cũ trước
- bê gần nguyên frontend từ `C:\Users\hoang\OneDrive\Desktop\Workspace\Aff\assets\fe_loveble\data-library-view-main\data-library-view-main`
- mang theo stack frontend tương ứng để source mới chạy đúng
- giữ backend FastAPI hiện tại và response API hiện tại làm chuẩn dữ liệu thật
- không dùng API bridge hoặc adapter đổi shape response
- nếu UI mới thiếu dữ liệu mà backend chưa có, chỉ fake đúng phần còn thiếu

## Nguyên tắc thực hiện

- Không giữ song song hai bộ UI.
- Không giữ fallback sang giao diện cũ.
- Không đổi contract backend chỉ để hợp UI mới.
- Không tạo tầng view-model trung gian khác shape response thật của backend.
- Ưu tiên đưa source mới chạy gần nguyên bản trước, rồi mới ghép API thật.
- Khi một block UI mới thiếu dữ liệu backend, giữ nguyên layout và dùng `fake/mock` cục bộ cho đúng block đó.
- Mỗi phase phải có điểm dừng rõ ràng để biết app đang ở trạng thái nào: `đã transplant`, `đã boot bằng mock`, `đã ghép live theo page`, `đã verify`.

## Phase 0: Chốt Nền Tảng Transplant

### Mục tiêu

Khóa rõ những file và stack nào của project nguồn sẽ trở thành chuẩn frontend mới, để phase xóa và bê source không bị nửa vời.

### File chính

- `package.json`
- `vite.config.ts`
- `tailwind.config.ts`
- `postcss.config.js`
- `components.json`
- `tsconfig.json`
- `tsconfig.app.json`
- `tsconfig.node.json`
- `eslint.config.js`

### Công việc

1. So sánh config frontend của repo đích với project nguồn.
2. Chốt bộ file config nào sẽ lấy nguyên từ nguồn và file nào phải giữ điều chỉnh riêng cho repo đích.
3. Ghi rõ phần config bắt buộc phải giữ để frontend mới vẫn gọi được backend hiện tại, đặc biệt là proxy `/api`.
4. Xác nhận dependency stack của source mới sẽ được mang sang đủ để `src` mới chạy đúng.

### Kết quả mong đợi

- Có danh sách rõ các file config frontend sẽ bị thay.
- Không còn hướng triển khai cũ kiểu chỉ ghép layout lên app hiện tại.

## Phase 1: Xóa Frontend Cũ Và Transplant Frontend Mới

### Mục tiêu

Xóa hẳn giao diện cũ của repo đích rồi đưa frontend từ project nguồn vào làm nền chính duy nhất.

### File chính

- `src/**`
- `package.json`
- `vite.config.ts`
- `tailwind.config.ts`
- `postcss.config.js`
- `components.json`
- `tsconfig*.json`
- `eslint.config.js`

### Công việc

1. Xóa toàn bộ `src/` giao diện cũ của `footage-finder`.
2. Đưa `src/` của project nguồn vào repo đích gần nguyên trạng.
3. Đưa theo các file config frontend tương ứng từ project nguồn.
4. Cập nhật dependency để khớp với source mới.
5. Giữ lại hoặc phục hồi các chi tiết cấu hình bắt buộc để `/api` vẫn trỏ đúng backend FastAPI hiện tại.

### Gate bắt buộc

- Sau phase này, repo không còn đường chạy nào của UI cũ.
- App có thể chưa ghép API thật, nhưng frontend shell, router, và component tree phải là của source mới.

### Kết quả mong đợi

- Repo đích đã đổi nền frontend xong.
- App chỉ còn một frontend mới để tiếp tục tích hợp.

## Phase 2: Boot Frontend Mới Với Dữ Liệu Nguồn Có Sẵn

### Mục tiêu

Chạy được frontend mới gần nguyên bản trước khi bắt đầu thay mock bằng dữ liệu thật.

### File chính

- `src/App.tsx`
- `src/main.tsx`
- `src/pages/**`
- `src/components/**`
- `src/data/**`

### Công việc

1. Cài dependency và sửa lỗi môi trường để frontend mới boot được trong repo đích.
2. Đảm bảo router, layout, CSS, ui primitives, và asset import của source mới chạy được.
3. Cho app lên bằng dữ liệu sẵn có của project nguồn ở những nơi chưa ghép backend.
4. Xác nhận từng page `Library`, `Search`, `Storyboard` render đúng bố cục gốc của source mới.

### Gate bắt buộc

- Trước khi ghép API thật, app mới phải tự đứng lên được bằng dữ liệu mock/fake của chính source mới hoặc dữ liệu tạm cùng shape đang dùng trong page.

### Kết quả mong đợi

- Có một baseline rõ: frontend mới đã chạy đúng về hình thức trước khi ghép backend.

## Phase 3: Dựng Lại Runtime Chung Cho Repo Đích

### Mục tiêu

Nối frontend mới vào môi trường runtime thực tế của repo đích mà không làm méo source mới.

### File chính

- `vite.config.ts`
- `package.json`
- `src/main.tsx`
- `src/App.tsx`
- các hook hoặc helper fetch chung nếu source mới có dùng

### Công việc

1. Giữ dev flow của repo đích hoạt động được với backend hiện tại.
2. Đảm bảo proxy `/api` tiếp tục hoạt động trên frontend mới.
3. Chốt nơi đặt các lời gọi API chung nếu source mới dùng query hook hoặc fetch helper.
4. Giữ nguyên nguyên tắc đọc trực tiếp response backend hiện có, không thêm adapter đổi shape.
5. Chuẩn hóa error handling và loading handling ở mức runtime chung nếu source mới cần provider hoặc query client.

### Kết quả mong đợi

- Frontend mới đã đứng đúng trong runtime của repo đích.
- Có thể bắt đầu thay mock bằng live API theo từng page.

## Phase 4: Ghép `LibraryPage` Với Dữ Liệu Thật

### Mục tiêu

Biến `LibraryPage` thành page đầu tiên dùng dữ liệu thật từ backend hiện tại trên giao diện mới.

### File chính

- `src/pages/LibraryPage.tsx`
- `src/components/library/**`
- các hook hoặc helper fetch trực tiếp cho `LibraryPage`

### Công việc

1. Xác định những block của `LibraryPage` đang dùng mock data trong source mới.
2. Thay dần các block lõi bằng dữ liệu thật từ backend hiện tại.
3. Giữ các action lõi chạy live nếu backend đã hỗ trợ:
   - load danh sách dữ liệu đã lưu
   - chọn dataset
   - đổi version
   - xem scene list
   - trim clip
   - export
   - delete
   - update tên nếu endpoint hiện có hỗ trợ
4. Các badge, summary, hoặc metadata phụ mà backend chưa có thì giữ fake cục bộ.
5. Đảm bảo page vẫn đúng layout của source mới.

### Gate bắt buộc

- `LibraryPage` không được quay lại dùng cấu trúc JSX hay state của UI cũ.
- Dữ liệu thật phải đi vào thẳng page mới theo response hiện tại của backend.

### Kết quả mong đợi

- `LibraryPage` là page live đầu tiên trên UI mới.

## Phase 5: Ghép `SearchPage` Với Flow Upload, Analyze, Và Search Thật

### Mục tiêu

Đưa flow nghiệp vụ quan trọng nhất của app lên giao diện mới mà vẫn giữ nguyên backend contract hiện tại.

### File chính

- `src/pages/SearchPage.tsx`
- `src/components/search/**`
- các hook hoặc helper fetch/SSE của `SearchPage`

### Công việc

1. Nối upload video vào endpoint hiện có.
2. Nối analyze flow và SSE vào UI mới.
3. Nối keyword search result vào đúng card hoặc panel của source mới.
4. Dùng dữ liệu thật cho các trạng thái `pending`, `analyzing`, `success`, `error`.
5. Giữ dữ liệu tạm cho các panel phụ hoặc số liệu phụ mà backend chưa cung cấp.
6. Đảm bảo page vẫn hiển thị được nhiều video trong phiên theo flow hiện tại của frontend mới, không đòi thêm API session mới.

### Gate bắt buộc

- Kết quả chính của analyze/search không được fake nếu backend thật đã trả được.
- Các phần fake chỉ được nằm ở block phụ của `SearchPage`.

### Kết quả mong đợi

- `SearchPage` chạy được upload, analyze, SSE, và search thật trên giao diện mới.

## Phase 6: Ghép `StoryboardPage` Với Flow Generate Thật

### Mục tiêu

Đưa flow storyboard thật lên đúng bố cục 3 cột của source mới.

### File chính

- `src/pages/StoryboardPage.tsx`
- `src/components/storyboard/**`
- các hook hoặc helper fetch của `StoryboardPage`

### Công việc

1. Nối source picker với dữ liệu source/version thật từ backend hiện tại.
2. Nối form generate storyboard với endpoint hiện có.
3. Hiển thị beat và match result theo response backend hiện tại ở những trường backend đã hỗ trợ.
4. Nối preview footage theo `scene.start/end` khi dữ liệu scene có sẵn.
5. Giữ fake cho metadata phụ, score, note, hoặc block trình bày thêm mà backend chưa có.

### Gate bắt buộc

- `StoryboardPage` phải dùng dữ liệu thật cho flow generate và preview chính.
- Không thêm tầng mapping mới để biến response storyboard sang shape khác.

### Kết quả mong đợi

- `StoryboardPage` chạy được flow storyboard thật trên UI mới.

## Phase 7: Điều Hướng Chéo Và Dọn Mock Không Còn Cần

### Mục tiêu

Hoàn thiện các handoff liên page và thu gọn phần mock chỉ còn đúng nơi backend thật vẫn chưa có dữ liệu.

### File chính

- `src/App.tsx`
- `src/pages/**`
- `src/data/**`
- các hook hoặc helper điều hướng liên page

### Công việc

1. Nối hành vi mở từ `Library` sang `Search`.
2. Nối hành vi mở từ `Library` sang `Storyboard`.
3. Truyền đúng context tối thiểu qua router của source mới.
4. Xóa các mock data không còn cần ở những block đã chuyển sang live.
5. Giữ lại chỉ những fake data thật sự còn cần cho dữ liệu backend đang thiếu.

### Kết quả mong đợi

- App không chỉ chạy từng page riêng lẻ mà còn đi được các luồng chéo giữa page.
- Phần mock đã được thu gọn đúng phạm vi spec cho phép.

## Phase 8: Ổn Định Error Handling Và Trạng Thái Hiển Thị

### Mục tiêu

Đảm bảo app mới xử lý tốt trạng thái `loading`, `empty`, `error`, `disabled` khi vừa có live data vừa có fake data.

### File chính

- `src/pages/**`
- `src/components/**`
- các provider hoặc hook trạng thái chung nếu source mới dùng

### Công việc

1. Đưa lỗi API thật về đúng block hoặc action gây lỗi.
2. Đảm bảo page không đổ sập chỉ vì một vùng live lỗi.
3. Đảm bảo block fake không chặn flow live của cùng page.
4. Chuẩn hóa empty state và loading state theo layout mới.
5. Loại bỏ thông báo lỗi chung kiểu app cũ nếu chúng không còn hợp cấu trúc app mới.

### Kết quả mong đợi

- App mới giữ được bố cục ổn định trong các tình huống lỗi hoặc thiếu dữ liệu.

## Phase 9: Verification Và Regression Check

### Mục tiêu

Xác nhận frontend mới đạt đủ tiêu chí hoàn thành của spec.

### Công việc

1. Chạy `npm run lint`.
2. Chạy `npm run build`.
3. Kiểm tra thủ công `LibraryPage` với backend thật.
4. Kiểm tra thủ công `SearchPage` với backend thật:
   - upload
   - analyze
   - SSE
   - search
5. Kiểm tra thủ công `StoryboardPage` với backend thật:
   - chọn source
   - generate
   - preview
6. Kiểm tra các handoff `Library -> Search` và `Library -> Storyboard`.
7. Xác nhận không còn đường chạy UI cũ trong app.
8. Xác nhận các phần fake còn lại đúng là do backend chưa có dữ liệu, không phải do ghép thiếu flow lõi.

### Kết quả mong đợi

- Frontend mới build được, chạy được, và dùng backend thật ở các luồng lõi.
- Phần dữ liệu fake còn lại có chủ đích và đúng phạm vi đã chốt.

## Thứ Tự Ưu Tiên

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7
9. Phase 8
10. Phase 9

## Tiêu chí bắt đầu code

Có thể bắt đầu implementation khi:

- spec đã được người dùng duyệt
- plan này phản ánh đúng spec mới đã chốt
- người dùng yêu cầu bắt đầu triển khai
