# Storyboard "Tạo mới" Button Design

## Context
Người dùng cần một cách rõ ràng để bắt đầu luồng tạo storyboard mới (reset kết quả/trạng thái chọn) mà vẫn giữ nguyên thông tin đã nhập trên form (Tên sản phẩm, Kịch bản, Tone giọng, v.v.). Hiện tại hành động này chưa có nút bấm UI tương ứng.

## Kiến trúc & Components

### 1. `src/App.tsx`
- **Data Flow**: `App.tsx` đã có sẵn hàm `resetStoryboardState()` làm nhiệm vụ clear các state: `storyboardResult`, `selectedSavedStoryboardId`, `selectedStoryboardBeatId`, `storyboardPreviewMatch`.
- **Thay đổi**: Truyền hàm `resetStoryboardState` này xuống component `StoryboardPage` thông qua một prop mới tên là `onResetStoryboard`.

### 2. `src/pages/StoryboardPage.tsx`
- **Props**: Thêm prop `onResetStoryboard: () => void`.
- **UI Layout**: Cập nhật khu vực footer (hiện đang chứa nút "Tạo storyboard"). 
  - Thay vì 1 nút full width, sử dụng `grid grid-cols-2 gap-2` hoặc layout tương đương để đặt 2 nút song song.
  - **Nút trái**: "Tạo mới". 
    - Style: Nút phụ (secondary) với class `bg-secondary text-secondary-foreground hover:bg-surface-hover`.
    - Trạng thái: Luôn luôn enabled (không bị disable bởi `isGeneratingStoryboard` hay điều kiện source).
    - Action: `onClick={onResetStoryboard}`.
  - **Nút phải**: "Tạo storyboard".
    - Style & Action: Giữ nguyên logic hiện tại (Primary button, disable khi đang generate hoặc thiếu source).

## Error Handling & Edge Cases
- **Bấm Tạo mới khi đang nhập form dang dở**: Form input không bị ảnh hưởng, chỉ reset kết quả của phiên trước (nếu có).
- **Bấm Tạo mới khi đang xem 1 storyboard đã lưu**: Xóa trạng thái active của saved storyboard, đưa UI về chế độ sẵn sàng tạo mới dựa trên input hiện tại.

## Testing Strategy
- Cập nhật/thêm test case trong `src/pages/StoryboardPage.test.tsx` để render `StoryboardPage` kèm prop `onResetStoryboard`.
- Assert nút "Tạo mới" xuất hiện trong document.
- Dùng `fireEvent.click` lên nút "Tạo mới" và assert `onResetStoryboard` được gọi 1 lần.
- Đảm bảo snapshot/layout không bị vỡ khi chuyển từ 1 nút sang 2 nút.