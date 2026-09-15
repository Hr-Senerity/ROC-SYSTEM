import { useRef, useState } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import { apiRequest } from '../shared/api/client';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';

interface MapUploadModalProps {
  projectId: string;
  token: string;
  onClose: () => void;
  onUploaded: () => void;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function MapUploadModal({ projectId, token, onClose, onUploaded }: MapUploadModalProps) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const selectFile = async (selectedFile?: File) => {
    if (!selectedFile) return;
    setError('');
    if (!ALLOWED_IMAGE_TYPES.has(selectedFile.type)) {
      setError('仅支持 PNG 或 JPEG 图片');
      return;
    }
    if (selectedFile.size > MAX_IMAGE_BYTES) {
      setError('图片不能超过 10 MB');
      return;
    }
    try {
      const dataUrl = await readDataUrl(selectedFile);
      setFile(selectedFile);
      setPreview(dataUrl);
      if (!name.trim()) setName(selectedFile.name.replace(/\.[^.]+$/, ''));
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : '读取文件失败');
    }
  };

  const upload = async () => {
    if (!file || uploading) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError('请输入地图名称');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const dataUrl = preview || await readDataUrl(file);
      const imageBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      await apiRequest(`/api/projects/${projectId}/maps/upload`, {
        method: 'POST',
        token,
        body: JSON.stringify({ name: normalizedName, image_base64: imageBase64 }),
      });
      onClose();
      onUploaded();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '上传地图失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !uploading) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>上传地图</DialogTitle>
          <DialogDescription>上传 PNG 或 JPEG 底图，单个文件最大 10 MB。</DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="map-name" className="text-sm font-medium">地图名称</label>
            <Input
              id="map-name"
              maxLength={128}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：一层仓库"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">地图图片</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex min-h-48 w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center transition-colors hover:border-blue-500 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {preview ? (
                <img src={preview} alt="待上传地图预览" className="max-h-64 max-w-full object-contain" />
              ) : (
                <span className="flex flex-col items-center text-slate-600">
                  <ImagePlus className="mb-3 size-10 text-slate-400" aria-hidden="true" />
                  <span className="font-medium">选择地图图片</span>
                  <span className="mt-1 text-xs text-slate-500">PNG / JPEG · 最大 10 MB</span>
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => void selectFile(event.target.files?.[0])}
              className="sr-only"
              aria-label="选择地图图片文件"
            />
            {file && <p className="text-xs text-slate-500">已选择：{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={uploading} onClick={onClose}>取消</Button>
          <Button disabled={!file || !name.trim() || uploading} onClick={() => void upload()}>
            <Upload className="size-4" aria-hidden="true" />{uploading ? '上传中…' : '上传地图'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
