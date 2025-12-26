import { useState, useRef, useEffect } from 'react';
import { X, RotateCcw } from 'lucide-react';

interface PuzzleVerificationProps {
  onSuccess: () => void;
  onClose: () => void;
}

export function PuzzleVerification({ onSuccess, onClose }: PuzzleVerificationProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(0);
  const [puzzleOffset, setPuzzleOffset] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const sliderRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const PUZZLE_WIDTH = 60;
  const TOLERANCE = 5; // 允许的误差范围

  useEffect(() => {
    // 随机生成拼图缺口位置（留出拼图宽度的空间）
    const maxOffset = 300 - PUZZLE_WIDTH - 20;
    const minOffset = 60;
    const randomOffset = Math.floor(Math.random() * (maxOffset - minOffset)) + minOffset;
    setPuzzleOffset(randomOffset);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStatus('idle');
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !trackRef.current) return;

    const track = trackRef.current;
    const rect = track.getBoundingClientRect();
    const maxPosition = rect.width - 50;
    
    let newPosition = e.clientX - rect.left - 25;
    newPosition = Math.max(0, Math.min(newPosition, maxPosition));
    
    setPosition(newPosition);
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    
    setIsDragging(false);
    setIsVerifying(true);

    // 计算拼图位置（按比例）
    const maxSlide = trackRef.current ? trackRef.current.offsetWidth - 50 : 300;
    const puzzlePosition = (position / maxSlide) * 300;

    // 检查是否匹配
    const isMatch = Math.abs(puzzlePosition - puzzleOffset) < TOLERANCE;

    setTimeout(() => {
      if (isMatch) {
        setStatus('success');
        setTimeout(() => {
          onSuccess();
        }, 500);
      } else {
        setStatus('error');
        setTimeout(() => {
          reset();
        }, 1000);
      }
      setIsVerifying(false);
    }, 300);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStatus('idle');
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging || !trackRef.current) return;

    const track = trackRef.current;
    const rect = track.getBoundingClientRect();
    const maxPosition = rect.width - 50;
    
    let newPosition = e.touches[0].clientX - rect.left - 25;
    newPosition = Math.max(0, Math.min(newPosition, maxPosition));
    
    setPosition(newPosition);
  };

  const handleTouchEnd = () => {
    handleMouseUp();
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, position]);

  const reset = () => {
    setPosition(0);
    setStatus('idle');
    // 重新生成拼图位置
    const maxOffset = 300 - PUZZLE_WIDTH - 20;
    const minOffset = 60;
    const randomOffset = Math.floor(Math.random() * (maxOffset - minOffset)) + minOffset;
    setPuzzleOffset(randomOffset);
  };

  const maxSlide = trackRef.current ? trackRef.current.offsetWidth - 50 : 300;
  const puzzleX = (position / maxSlide) * 300;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl text-slate-900">完成验证</h3>
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              title="刷新"
            >
              <RotateCcw className="w-5 h-5 text-slate-600" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        {/* 拼图区域 */}
        <div className="mb-6 relative bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg overflow-hidden" style={{ height: '200px' }}>
          {/* 背景图案 */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 opacity-30">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute bg-white rounded-full"
                  style={{
                    width: Math.random() * 40 + 20 + 'px',
                    height: Math.random() * 40 + 20 + 'px',
                    left: Math.random() * 100 + '%',
                    top: Math.random() * 100 + '%',
                  }}
                />
              ))}
            </div>
          </div>

          {/* 拼图缺口 */}
          <div
            className="absolute bg-white/40 backdrop-blur-sm border-2 border-white/60 rounded-lg transition-all"
            style={{
              width: PUZZLE_WIDTH + 'px',
              height: PUZZLE_WIDTH + 'px',
              left: puzzleOffset + 'px',
              top: '70px',
            }}
          >
            <div className="absolute inset-1 border-2 border-dashed border-white/60 rounded-md" />
          </div>

          {/* 移动的拼图块 */}
          <div
            className={`absolute transition-all ${
              status === 'success' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-blue-500'
            } rounded-lg shadow-lg`}
            style={{
              width: PUZZLE_WIDTH + 'px',
              height: PUZZLE_WIDTH + 'px',
              left: puzzleX + 'px',
              top: '70px',
              opacity: status === 'success' ? 0.8 : 1,
            }}
          >
            <div className="absolute inset-2 border-2 border-white/40 rounded-md" />
          </div>

          {/* 状态提示 */}
          {status === 'success' && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-500/20">
              <div className="bg-white rounded-full px-6 py-3 shadow-lg">
                <span className="text-green-600">验证成功！</span>
              </div>
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
              <div className="bg-white rounded-full px-6 py-3 shadow-lg">
                <span className="text-red-600">验证失败，请重试</span>
              </div>
            </div>
          )}
        </div>

        {/* 滑块控制 */}
        <div className="relative">
          <div
            ref={trackRef}
            className={`h-12 bg-slate-100 rounded-lg relative overflow-hidden ${
              status === 'success' ? 'bg-green-100' : status === 'error' ? 'bg-red-100' : ''
            }`}
          >
            {/* 进度条 */}
            <div
              className={`h-full transition-all ${
                status === 'success'
                  ? 'bg-green-500'
                  : status === 'error'
                  ? 'bg-red-500'
                  : 'bg-blue-500'
              }`}
              style={{ width: position + 50 + 'px' }}
            />

            {/* 滑块 */}
            <div
              ref={sliderRef}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              className={`absolute top-1 h-10 w-12 bg-white rounded-lg shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center transition-all ${
                isDragging ? 'scale-110' : ''
              } ${status === 'success' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : ''}`}
              style={{ left: position + 'px' }}
            >
              <div className="flex gap-0.5">
                <div className={`w-1 h-4 rounded-full ${status === 'idle' ? 'bg-slate-400' : 'bg-white'}`} />
                <div className={`w-1 h-4 rounded-full ${status === 'idle' ? 'bg-slate-400' : 'bg-white'}`} />
                <div className={`w-1 h-4 rounded-full ${status === 'idle' ? 'bg-slate-400' : 'bg-white'}`} />
              </div>
            </div>

            {/* 提示文字 */}
            {position === 0 && status === 'idle' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-slate-500">拖动滑块完成拼图</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
