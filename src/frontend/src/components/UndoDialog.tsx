interface UndoDialogProps {
  requestingPlayerName: string;
  onApprove: () => void;
  onDecline: () => void;
}

export default function UndoDialog({ requestingPlayerName, onApprove, onDecline }: UndoDialogProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Undo Request</h2>
        <p className="text-gray-700 mb-6">
          {requestingPlayerName} is requesting to undo the last action. Do you agree?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 bg-red-500 text-white font-bold py-2 px-4 rounded hover:bg-red-600"
          >
            Decline
          </button>
          <button
            onClick={onApprove}
            className="flex-1 bg-green-500 text-white font-bold py-2 px-4 rounded hover:bg-green-600"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
