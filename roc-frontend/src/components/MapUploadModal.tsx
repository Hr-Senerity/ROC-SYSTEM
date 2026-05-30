import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';

interface MapUploadModalProps {
  projectId: string;
  token: string;
  apiBase: string;
  onClose: () => void;
  onUploaded: () => void;
}

export function MapUploadModal({ projectId, token, apiBase, onClose, onUploaded }: MapUploadModalProps) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError('');

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);

    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleUpload = async () => {
    if (!file) { setError('请选择文件'); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = (reader.result as string).split(',')[1];
        try {
          const resp = await fetch(`${apiBase}/api/projects/${projectId}/maps/upload`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ name: name || 'Untitled', image_base64: b64 }),
          });
          const data = await resp.json();
          if (data.ok) { onUploaded(); onClose(); }
          else { setError(data.message || '上传失败'); }
        } catch { setError('网络错误'); }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch { setError('读取文件失败'); setUploading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl text-slate-900">上传地图</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-center">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-slate-700 mb-2">地图名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例如: 一层仓库"
            />
          </div>

          <div>
            <label className="block text-slate-700 mb-2">地图图片</label>
            <div
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                file ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              {preview ? (
                <img src={preview} alt="预览" className="max-h-40 mx-auto rounded" />
              ) : (
                <div>
                  <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-600">点击选择图片</p>
                  <p className="text-slate-400 text-sm">支持 PNG/JPG，最大 10MB</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg" onChange={handleFileChange} hidden />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">
            取消
          </button>
          <button onClick={handleUpload} disabled={uploading || !file}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50">
            {uploading ? '上传中...' : '上传'}
          </button>
        </div>
      </div>
    </div>
  );
}
