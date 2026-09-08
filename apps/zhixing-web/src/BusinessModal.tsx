import type {MouseEvent, ReactNode} from 'react';
import {Button, Modal, type ModalProps} from 'antd';
import './dialogs.css';

/** Shared customer-facing dialog frame. Explicit null footers retain a close action. */
export function BusinessModal({title, description, children, footer, className, ...props}: ModalProps & {description?: ReactNode}) {
  return <Modal centered width={760} cancelText="取消" okText="确认" {...props}
    className={['business-modal', className].filter(Boolean).join(' ')}
    title={<div className="dialog-heading"><span className="dialog-eyebrow">知行 · 声研实验室</span><div className="dialog-title">{title}</div>{description && <p>{description}</p>}</div>}
    footer={footer === null ? <Button onClick={event => props.onCancel?.(event as MouseEvent<HTMLButtonElement>)}>关闭</Button> : footer}>
    <div className="dialog-content">{children}</div>
  </Modal>;
}

export function PanelSection({title, description, extra, children}: {title: ReactNode; description?: ReactNode; extra?: ReactNode; children: ReactNode}) {
  return <section className="panel-section"><header><div><h3>{title}</h3>{description && <p>{description}</p>}</div>{extra}</header>{children}</section>;
}

export function PanelStats({items}: {items: {label: ReactNode; value: ReactNode}[]}) {
  return <div className="panel-stats">{items.map((item, i) => <div key={i}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>;
}
