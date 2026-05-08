import { useImageWorkspace } from '../../hooks/useImageWorkspace.js';
import LibraryNav from './LibraryNav.jsx';
import ImageGrid from './ImageGrid.jsx';
import AgentChat from './AgentChat.jsx';
import GenerationBar from './GenerationBar.jsx';
import DetailModal from './DetailModal.jsx';
import EditModal from './EditModal.jsx';
import './ImageWorkspace.css';

export default function ImageWorkspace() {
  const ws = useImageWorkspace();

  return (
    <div className="image-workspace">
      <div className="image-workspace-main">
        <LibraryNav
          images={ws.images}
          folders={ws.folders}
          activeFolder={ws.activeFolder}
          showStarred={ws.showStarred}
          onSetFolder={ws.setActiveFolder}
          onToggleStarred={() => ws.setShowStarred(v => !v)}
          onAddFolder={() => ws.setAddingFolder(true)}
          onDeleteFolder={ws.deleteFolder}
          addingFolder={ws.addingFolder}
          newFolderName={ws.newFolderName}
          onNewFolderName={ws.setNewFolderName}
          onConfirmFolder={ws.addFolder}
          onCancelFolder={() => { ws.setAddingFolder(false); ws.setNewFolderName(''); }}
          onDropToFolder={ws.handleDropToFolder}
        />

        <ImageGrid
          images={ws.images}
          activeFolder={ws.activeFolder}
          showStarred={ws.showStarred}
          selectedImages={ws.selectedImages}
          folders={ws.folders}
          onStar={ws.handleStar}
          onEdit={img => ws.setEditImg(img)}
          onCardClick={img => ws.setDetailImg(img)}
          onToggleSelect={ws.toggleSelect}
          onBulkDelete={ws.handleBulkDelete}
          onBulkSetFolder={ws.handleBulkSetFolder}
          onClearSelection={ws.clearSelection}
        />

        <AgentChat
          messages={ws.chatMessages}
          chatInput={ws.chatInput}
          onInputChange={ws.setChatInput}
          onSend={() => {
            if (!ws.chatInput.trim()) return;
            ws.sendImageChatMessage(ws.chatInput.trim());
            ws.setChatInput('');
          }}
        />
      </div>

      <GenerationBar
        prompt={ws.prompt}
        setPrompt={ws.setPrompt}
        negPrompt={ws.negPrompt}
        setNegPrompt={ws.setNegPrompt}
        enhance={ws.enhance}
        setEnhance={ws.setEnhance}
        seed={ws.seed}
        setSeed={ws.setSeed}
        lockSeed={ws.lockSeed}
        setLockSeed={ws.setLockSeed}
        batchCount={ws.batchCount}
        setBatchCount={ws.setBatchCount}
        aspectRatio={ws.aspectRatio}
        setAspectRatio={ws.setAspectRatio}
        customRes={ws.customRes}
        setCustomRes={ws.setCustomRes}
        negOpen={ws.negOpen}
        setNegOpen={ws.setNegOpen}
        moreOpen={ws.moreOpen}
        setMoreOpen={ws.setMoreOpen}
        queue={ws.queue}
        cancelQueueItem={ws.cancelQueueItem}
        onGenerate={ws.handleGenerate}
      />

      {ws.detailImg && (
        <DetailModal
          img={ws.detailImg}
          onClose={() => ws.setDetailImg(null)}
          onStar={ws.handleStar}
          onEdit={img => { ws.setDetailImg(null); ws.setEditImg(img); }}
          onDelete={ws.handleDelete}
        />
      )}

      {ws.editImg && (
        <EditModal
          img={ws.editImg}
          onClose={() => ws.setEditImg(null)}
          onSaveToLibrary={(newImg) => {
            ws.setImages(prev => [newImg, ...prev]);
            ws.setEditImg(null);
          }}
        />
      )}
    </div>
  );
}
