import cloudinary from "../config/cloudinary";

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

/**
 * Upload buffer ke Cloudinary.
 *
 * `folder` dipisah antara "posts" dan "avatars" supaya file bisa dikelola
 * sendiri-sendiri (mis. kebijakan transformasi berbeda untuk foto profil).
 */
export const uploadToCloudinary = (
  fileBuffer: Buffer,
  folder: "posts" | "avatars" = "posts",
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) return reject(error);
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );
    uploadStream.end(fileBuffer);
  });
};

/**
 * Hapus gambar dari Cloudinary.
 * Dipakai saat avatar diganti/dihapus agar file lama tidak menumpuk memenuhi kuota.
 * Kegagalan di sini tidak boleh menggagalkan permintaan pengguna, jadi error
 * cukup dicatat di log dan fungsi tetap selesai.
 */
export const deleteFromCloudinary = async (publicId?: string | null) => {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch (error) {
    console.error("Delete Cloudinary asset error:", error);
  }
};
