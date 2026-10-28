import type { Step } from 'react-joyride';
import type { TourStage } from './tour-progress';

export function tourSteps(stage: TourStage, readOnly: boolean): Step[] {
  if (stage === 'workspace') return [
    { target: '[data-tour="workspaces"]', title: '從工作區開始', content: '個人工作區放自己的專案；需要協作時，再建立共享工作區。這段教學只介紹操作，不會替你新增資料。' },
    { target: '[data-tour="create-project"]', title: '建立第一個專案', content: '教學結束後，按「新增專案」，填寫名稱與描述，再點專案卡片進入畫布。第一次進入畫布時，會接著介紹節點操作。' },
    { target: '[data-tour="create-workspace"]', title: '邀請別人一起整理', content: '需要整個工作區一起協作時，建立共享工作區並邀請成員；只合作一個專案時，可在畫布建立專案邀請連結，設定編輯或檢視權限。' },
    { target: '[data-tour-replay="workspace"]', title: '隨時重看教學', content: '之後可按這個按鈕重新看教學，或從首頁開啟完整手冊。刪除專案前先下載需要的原檔並確認備份；刪除後介面不提供復原，啟用清理時原檔也會在寬限期後清除。' },
  ];
  return [
    { target: '[data-tour="resources"]', title: '先放入資料', content: readOnly ? '這裡保存專案的文字、連結與原始檔。你目前是僅檢視成員，可以閱讀，但不能修改資料。' : '資料池可加入文字、連結或檔案。檔案需非空且不超過 20 MB；上傳 PDF 不代表 AI 會讀取全文。' },
    { target: '[data-tour="node-toolbar-zone"]', title: '新增與雙擊編輯節點', content: '選文字、連結或圖片圖示新增節點。直接在節點標題或內容連點兩下，可修改內容與底色，再按「儲存變更」。' },
    { target: '[data-canvas-area="zone"] .canvas-grid', title: '移動節點與建立連線', content: readOnly ? '拖曳空白處可移動視角，使用左下角按鈕縮放。僅檢視成員不能移動節點或修改連線。' : '拖曳節點可移動位置；從下方圓點拉到另一個節點上方圓點可連線。雙擊「線」改關係文字，雙擊「節點」改內容，兩者不同。' },
    { target: '[data-canvas-area="diverge"] .canvas-grid', title: '在這裡發散想法', content: '把問題、假設與不同方案放在發散思考區。星號可標記重要想法；AI 收斂會參考這些節點與連線，不只看專案名稱。' },
    { target: '[data-tour="assistant"]', title: '用 AI 延伸思考', content: '先在工作區側欄「AI Key」設定自己的 Gemini Key。選取發散節點可針對它提問；回覆按「產生節點」，檢查預覽後才會加入畫布。' },
    { target: '[data-canvas-area="converge"] .canvas-grid', title: '從發散整理成結論', content: '「整理成結論」主要依據發散節點、連線及重要標記，資料架構作背景。請檢查來源與結論；重新產生會替換前一批 AI 收斂節點。' },
    { target: '[data-tour="canvas-save"]', title: '等「已儲存」再離開', content: '修改會自動儲存；共編模式顯示「已同步」，也可看到其他在線者與游標。離線時保持頁面開啟，恢復連線後才會合併或重試；遇到版本衝突時，先備份未儲存內容再重載。' },
    { target: '[data-tour="canvas-export"]', title: '匯出 PDF 或 PNG', content: '先展開三個畫布區域。PDF 會開列印視窗，選「另存為 PDF」；PNG 下載的是分區圖片 ZIP，解壓縮後閱讀。' },
    { target: '[data-tour-replay="canvas"]', title: '開始整理你的畫布', content: '這個按鈕可以重新看教學，詳細步驟請開啟完整手冊。重要階段可請工作區擁有者或管理者立即備份；「已同步」不等於已建立歷史備份。' },
  ];
}
