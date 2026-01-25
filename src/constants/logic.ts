export const IRT_CONFIG = {
  MIN_THETA: -3.0,
  MAX_THETA: 3.0,
  BASE_K: 1.0, // Hệ số K tối đa (khi chưa chắc chắn gì cả)
  MIN_K: 0.2, // Hệ số K tối thiểu (khi đã rất chắc chắn)
  CERTAINTY_STEP: 0.05, // Mỗi lần làm bài, độ tin cậy tăng
  MASTERED_THRESHOLD: 1.5, // Ngưỡng "Thành thạo"
};
