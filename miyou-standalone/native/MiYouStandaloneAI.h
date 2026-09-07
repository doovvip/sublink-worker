#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^MYSAExtensionHandler)(void);

#define MYSA_EXPORT FOUNDATION_EXPORT __attribute__((visibility("default")))

MYSA_EXPORT NSString *MYSAVersion(void);
MYSA_EXPORT NSArray<NSString *> *MYSAGetCachedReplies(void);
MYSA_EXPORT void MYSASetExternalContext(NSString *contact, NSArray<NSString *> *context);
MYSA_EXPORT void MYSAInvalidateReplies(void);
MYSA_EXPORT void MYSARequestRefresh(void);
MYSA_EXPORT void MYSARegisterExtension(NSString *identifier, NSString *title, MYSAExtensionHandler handler);
MYSA_EXPORT NSArray<NSDictionary *> *MYSARegisteredExtensions(void);
MYSA_EXPORT BOOL MYSAInvokeExtension(NSString *identifier);

NS_ASSUME_NONNULL_END
