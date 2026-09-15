import './ui/hud.css';
import { mountBuildBadge } from './boot/buildInfo';
import { setBootState } from './debug/testHook';

mountBuildBadge();
setBootState('booting');
// Plan 01-02 extends the boot sequence (capability gate, loading, play).
