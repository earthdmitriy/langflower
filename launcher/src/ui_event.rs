use crate::detect::DetectRuntime;
use crate::ready_line::ReadyPayload;

#[derive(Clone)]
pub enum UiEvent {
	Log {
		project_key: String,
		stream: &'static str,
		text: String,
	},
	Ready {
		project_key: String,
		payload: ReadyPayload,
	},
	Exit {
		project_key: String,
		code: Option<i32>,
	},
	SpawnFailed {
		project_key: String,
		message: String,
	},
	DetectDone(Result<DetectRuntime, String>),
	InstallDone(Result<(), String>),
}

#[derive(Clone)]
pub struct UiSender {
	inner: std::sync::mpsc::Sender<UiEvent>,
	wake_ui: bool,
}

impl UiSender {
	pub fn new(inner: std::sync::mpsc::Sender<UiEvent>) -> Self {
		Self {
			inner,
			wake_ui: true,
		}
	}

	/// Channel only — no Slint wake. Integration tests have no window.
	pub fn without_ui_wake(inner: std::sync::mpsc::Sender<UiEvent>) -> Self {
		Self {
			inner,
			wake_ui: false,
		}
	}

	pub fn send(&self, event: UiEvent) {
		let _ = self.inner.send(event);
		if self.wake_ui {
			let _ = slint::invoke_from_event_loop(crate::ui::drain_events);
		}
	}
}
