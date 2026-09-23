import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Upload } from 'lucide-react';
import { apiRequest } from '../shared/api/client';
import {
  formatMiB,
  mapNameFromFileName,
  mapUploadTransportName,
  validateMapImageFile,
} from '../features/maps/upload';
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

export function MapUploadModal({ projectId, token, onClose, onUploaded }: MapUploadModalProps) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const selectFile = (selectedFile?: File) => {
    if (!selectedFile) return;
    setError('');
    setFile(null);
    setPreview('');
    const validationError = validateMapImageFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      if (!name.trim()) setName(mapNameFromFileName(selectedFile.name));
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
      const body = new FormData();
      body.append('name', normalizedName);
      body.append('image', file, mapUploadTransportName(file));
      await apiRequest(`/api/projects/${projectId}/maps/upload`, {
        method: 'POST',
        token,
        body,
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
          <DialogDescription>上传 PNG 或 JPEG 底图，单个文件最大 30 MiB；地图名称和原始文件名均支持中文。</DialogDescription>
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
                  <span className="mt-1 text-xs text-slate-500">PNG / JPEG · 最大 30 MiB · 支持中文文件名</span>
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => selectFile(event.target.files?.[0])}
              className="sr-only"
              aria-label="选择地图图片文件"
            />
            {file && <p className="text-xs text-slate-500">已选择：{file.name} · {formatMiB(file.size)} MiB</p>}
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
