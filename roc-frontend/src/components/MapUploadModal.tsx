import { useEffect, useRef, useState } from 'react';
import { FileText, ImagePlus, Ruler, Upload } from 'lucide-react';
import { apiRequest } from '../shared/api/client';
import {
  formatMiB,
  mapNameFromFileName,
  mapUploadTransportName,
  type MapUploadMode,
  validateManualCalibration,
  validateMapImageFile,
  validateMapYamlFile,
  validatePgmFile,
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

const uploadModes: Array<{
  id: MapUploadMode;
  title: string;
  description: string;
  icon: typeof ImagePlus;
}> = [
  { id: 'image', title: '普通图片', description: 'PNG/JPEG，使用旧版归一化坐标', icon: ImagePlus },
  { id: 'calibrated-image', title: '图片并标定', description: '手动输入米/像素和世界原点', icon: Ruler },
  { id: 'pgm-yaml', title: 'PGM + YAML', description: '自动读取 ROS/Cartographer 导出参数', icon: FileText },
];

export function MapUploadModal({ projectId, token, onClose, onUploaded }: MapUploadModalProps) {
  const [mode, setMode] = useState<MapUploadMode>('image');
  const [name, setName] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pgmFile, setPgmFile] = useState<File | null>(null);
  const [yamlFile, setYamlFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [resolution, setResolution] = useState('0.05');
  const [originX, setOriginX] = useState('0');
  const [originY, setOriginY] = useState('0');
  const [originTheta, setOriginTheta] = useState('0');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const imageRef = useRef<HTMLInputElement>(null);
  const pgmRef = useRef<HTMLInputElement>(null);
  const yamlRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const switchMode = (nextMode: MapUploadMode) => {
    if (uploading || nextMode === mode) return;
    setMode(nextMode);
    setError('');
    setImageFile(null);
    setPgmFile(null);
    setYamlFile(null);
    setPreview('');
  };

  const selectImage = (selectedFile?: File) => {
    if (!selectedFile) return;
    setError('');
    setImageFile(null);
    setPreview('');
    const validationError = validateMapImageFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }
    setImageFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
    if (!name.trim()) setName(mapNameFromFileName(selectedFile.name));
  };

  const selectPgm = (selectedFile?: File) => {
    if (!selectedFile) return;
    const validationError = validatePgmFile(selectedFile);
    if (validationError) {
      setPgmFile(null);
      setError(validationError);
      return;
    }
    setError('');
    setPgmFile(selectedFile);
    if (!name.trim()) setName(mapNameFromFileName(selectedFile.name));
  };

  const selectYaml = (selectedFile?: File) => {
    if (!selectedFile) return;
    const validationError = validateMapYamlFile(selectedFile);
    if (validationError) {
      setYamlFile(null);
      setError(validationError);
      return;
    }
    setError('');
    setYamlFile(selectedFile);
  };

  const ready = mode === 'pgm-yaml' ? Boolean(pgmFile && yamlFile) : Boolean(imageFile);

  const upload = async () => {
    if (!ready || uploading) return;
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError('请输入地图名称');
      return;
    }
    if (mode === 'calibrated-image') {
      const calibrationError = validateManualCalibration({ resolution, originX, originY, originTheta });
      if (calibrationError) {
        setError(calibrationError);
        return;
      }
    }
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('name', normalizedName);
      if (mode === 'pgm-yaml') {
        body.append('source_type', 'pgm-yaml');
        body.append('pgm', pgmFile!, 'map-source.pgm');
        body.append('yaml', yamlFile!, 'map-source.yaml');
      } else {
        body.append('source_type', 'image');
        body.append('coordinate_mode', mode === 'calibrated-image' ? 'metric' : 'legacy-normalized');
        body.append('image', imageFile!, mapUploadTransportName(imageFile!));
        if (mode === 'calibrated-image') {
          body.append('resolution', resolution);
          body.append('origin_x', originX);
          body.append('origin_y', originY);
          body.append('origin_theta', originTheta);
        }
      }
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>上传地图</DialogTitle>
          <DialogDescription>选择地图来源。Cartographer 地图请先导出为标准 PGM + YAML，再使用同一入口上传。</DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">地图来源与坐标</legend>
            <div role="radiogroup" aria-label="地图上传模式" data-upload-contract="t18-v1" className="grid gap-2 sm:grid-cols-3">
              {uploadModes.map((item) => {
                const Icon = item.icon;
                const selected = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => switchMode(item.id)}
                    className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${selected ? 'border-blue-600 bg-blue-50 text-blue-950' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <Icon className={`mb-2 size-5 ${selected ? 'text-blue-600' : 'text-slate-500'}`} aria-hidden="true" />
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="map-name" className="text-sm font-medium">地图名称</label>
            <Input id="map-name" maxLength={128} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：一层仓库" autoFocus />
          </div>

          {mode !== 'pgm-yaml' ? (
            <div className="space-y-2">
              <span className="text-sm font-medium">地图图片</span>
              <button
                type="button"
                onClick={() => imageRef.current?.click()}
                className="flex min-h-44 w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center transition-colors hover:border-blue-500 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {preview ? <img src={preview} alt="待上传地图预览" className="max-h-56 max-w-full object-contain" /> : (
                  <span className="flex flex-col items-center text-slate-600">
                    <ImagePlus className="mb-3 size-10 text-slate-400" aria-hidden="true" />
                    <span className="font-medium">选择地图图片</span>
                    <span className="mt-1 text-xs text-slate-500">PNG / JPEG · 最大 30 MiB · 支持中文文件名</span>
                  </span>
                )}
              </button>
              <input ref={imageRef} type="file" accept="image/png,image/jpeg" onChange={(event) => selectImage(event.target.files?.[0])} className="sr-only" aria-label="选择地图图片文件" />
              {imageFile && <p className="text-xs text-slate-500">已选择：{imageFile.name} · {formatMiB(imageFile.size)} MiB</p>}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <SourceFileButton label="PGM 栅格图" hint=".pgm · P2 或 P5 · 最大 30 MiB" file={pgmFile} onClick={() => pgmRef.current?.click()} />
              <SourceFileButton label="YAML 元数据" hint=".yaml / .yml · 最大 1 MiB" file={yamlFile} onClick={() => yamlRef.current?.click()} />
              <input ref={pgmRef} type="file" accept=".pgm" onChange={(event) => selectPgm(event.target.files?.[0])} className="sr-only" aria-label="选择 PGM 地图文件" />
              <input ref={yamlRef} type="file" accept=".yaml,.yml,application/yaml,text/yaml" onChange={(event) => selectYaml(event.target.files?.[0])} className="sr-only" aria-label="选择地图 YAML 文件" />
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">平台将校验 YAML 的 resolution、origin、阈值及 image 路径，保留原始文件并生成浏览器 PNG 预览。坐标自动采用米制。</p>
            </div>
          )}

          {mode === 'calibrated-image' && (
            <fieldset className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <legend className="px-1 text-sm font-semibold">米制标定参数</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label="分辨率（米/像素）" value={resolution} onChange={setResolution} />
                <NumberField label="原点旋转（弧度）" value={originTheta} onChange={setOriginTheta} />
                <NumberField label="世界原点 X（米）" value={originX} onChange={setOriginX} />
                <NumberField label="世界原点 Y（米）" value={originY} onChange={setOriginY} />
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">世界坐标约定：X 向右、Y 向上。原点对应图片左下角；旋转角按逆时针为正。</p>
            </fieldset>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={uploading} onClick={onClose}>取消</Button>
          <Button disabled={!ready || !name.trim() || uploading} onClick={() => void upload()}>
            <Upload className="size-4" aria-hidden="true" />{uploading ? '上传中…' : '上传地图'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourceFileButton({ label, hint, file, onClick }: { label: string; hint: string; file: File | null; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-left hover:border-blue-500 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
      <FileText className="mb-3 size-7 text-slate-400" aria-hidden="true" />
      <span className="block text-sm font-semibold text-slate-900">{label}</span>
      <span className="mt-1 block truncate text-xs text-slate-500">{file ? `${file.name} · ${formatMiB(file.size)} MiB` : hint}</span>
    </button>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-sm text-slate-700">
      <span>{label}</span>
      <Input type="number" step="any" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
