export function syncMobileControls(isGhostMode, isMapEditMode) {
    const actionButtons = document.getElementById('mobile-actions');
    const lookJoystick = document.getElementById('joystick-look-container');

    if (!actionButtons || !lookJoystick) return;

    if (isGhostMode || isMapEditMode) {
        actionButtons.classList.add('hidden');
        lookJoystick.classList.remove('hidden');
    } else {
        actionButtons.classList.remove('hidden');
        lookJoystick.classList.add('hidden');
    }
}

function setupJoystick(baseId, stickId, onUpdate, onEnd) {
    const base = document.getElementById(baseId);
    const stick = document.getElementById(stickId);
    if (!base || !stick) return;
    
    const container = base.parentElement;
    let activeTouchId = null;

    container.classList.remove('hidden');

    base.addEventListener('touchstart', (e) => {
        if (activeTouchId !== null) return;
        const touch = e.changedTouches[0];
        activeTouchId = touch.identifier;
        update(touch);
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
                update(e.changedTouches[i]);
                e.stopPropagation();
                if (e.cancelable) e.preventDefault();
                break;
            }
        }
    }, { passive: false });

    const end = (e) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === activeTouchId) {
                activeTouchId = null;
                stick.style.transform = `translate(0, 0)`;
                onEnd();
                break;
            }
        }
    };

    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    function update(touch) {
        const rect = base.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const maxDistance = rect.width / 2;

        let dx = touch.clientX - centerX;
        let dy = touch.clientY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > maxDistance) {
            dx = (dx / distance) * maxDistance;
            dy = (dy / distance) * maxDistance;
        }

        stick.style.transform = `translate(${dx}px, ${dy}px)`;
        onUpdate(dx / maxDistance, -dy / maxDistance);
    }
}

export function initMobileControls(state, isGhostMode = false, isMapEditMode = false) {
    setupJoystick('joystick-move-base', 'joystick-move-stick', 
        (x, y) => { state.joystickMoveVector.set(x, y); },
        () => { state.joystickMoveVector.set(0, 0); }
    );

    setupJoystick('joystick-look-base', 'joystick-look-stick',
        (x, y) => { state.joystickLookVector.set(x, y); },
        () => { state.joystickLookVector.set(0, 0); }
    );

    syncMobileControls(isGhostMode, isMapEditMode);

    const btnCrouch = document.getElementById('btn-mobile-crouch');
    if (btnCrouch) {
        btnCrouch.addEventListener('touchstart', (e) => {
            state.isMobileCrouching = true;
            btnCrouch.classList.add('active');
            e.preventDefault();
        }, { passive: false });
        btnCrouch.addEventListener('touchend', () => {
            state.isMobileCrouching = false;
            btnCrouch.classList.remove('active');
        });
    }

    const btnJump = document.getElementById('btn-mobile-jump');
    if (btnJump) {
        btnJump.addEventListener('touchstart', (e) => {
            state.isMobileJumping = true;
            btnJump.classList.add('active');
            e.preventDefault();
        }, { passive: false });
        btnJump.addEventListener('touchend', () => {
            state.isMobileJumping = false;
            btnJump.classList.remove('active');
        });
    }
}
