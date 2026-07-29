export const useImageValidation = () => {
  const maxSize = 20 * 1024 * 1024; // 20MB

  const validateFile = (file) => {
    const isImage = file.type.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name);
    if (!isImage) {
      return { isValid: false, error: "File is not an image" };
    }
    if (file.size > maxSize) {
      return { isValid: false, error: "Image size is greater than 20MB" };
    }
    return { isValid: true, error: "" };
  };

  const validateUrl = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ isValid: true, error: "" });
      img.onerror = () => reject({ isValid: false, error: "URL is not a valid image" });
      img.src = url;
    });
  };

  return { validateFile, validateUrl };
};